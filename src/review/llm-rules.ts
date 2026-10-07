import { z } from "zod";
import type { Finding, Rule } from "../shared/schemas";
import { matchesAnyGlob } from "./paths";
import { snippet } from "./regex-rules";
import type { AddedLine, CompleteFn, FileChange, LlmMessage } from "./types";

/** One LLM call: a slice of one file checked against a few rules. */
export interface LlmBatch {
  file: string;
  lines: AddedLine[];
  rules: Pick<Rule, "id" | "title" | "description" | "severity" | "fix">[];
}

export interface BatchLimits {
  maxLinesPerBatch: number;
  maxRulesPerBatch: number;
  maxBatches: number;
}

export const DEFAULT_BATCH_LIMITS: BatchLimits = {
  maxLinesPerBatch: 120,
  maxRulesPerBatch: 4,
  maxBatches: 30
};

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Splits the work into small batches so each prompt stays focused and the
 * model's output stays short. Stops at `maxBatches` to bound cost.
 */
export function buildLlmBatches(
  files: readonly FileChange[],
  rules: readonly Rule[],
  limits: BatchLimits = DEFAULT_BATCH_LIMITS
): { batches: LlmBatch[]; truncated: boolean } {
  const llmRules = rules.filter((r) => r.enabled && r.kind === "llm");
  const batches: LlmBatch[] = [];

  for (const file of files) {
    const applicable = llmRules.filter((r) =>
      matchesAnyGlob(file.path, r.appliesTo)
    );
    if (applicable.length === 0 || file.addedLines.length === 0) continue;

    for (const lines of chunk(file.addedLines, limits.maxLinesPerBatch)) {
      for (const ruleGroup of chunk(applicable, limits.maxRulesPerBatch)) {
        if (batches.length >= limits.maxBatches) {
          return { batches, truncated: true };
        }
        batches.push({
          file: file.path,
          lines,
          rules: ruleGroup.map(({ id, title, description, severity, fix }) => ({
            id,
            title,
            description,
            severity,
            fix
          }))
        });
      }
    }
  }
  return { batches, truncated: false };
}

const SYSTEM_PROMPT = `You are a strict, precise code reviewer.
You check ONLY the numbered lines you are given against ONLY the rules you are given.
Report a finding only when a line clearly violates a rule. Do not report style nits outside the rules.
If nothing violates the rules, return {"findings": []}.
Respond with JSON only, no prose, matching:
{"findings": [{"ruleId": string, "line": number, "message": string, "suggestion": string}]}
- "line" must be one of the given line numbers.
- "message" explains in one sentence what is wrong on that line.
- "suggestion" says concretely how to fix it.`;

export function buildBatchPrompt(batch: LlmBatch): LlmMessage[] {
  const rules = batch.rules
    .map((r) => `- ${r.id}: ${r.title}. ${r.description}`)
    .join("\n");
  const code = batch.lines.map((l) => `${l.line}: ${l.content}`).join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Rules:\n${rules}\n\nFile: ${batch.file}\nAdded lines (line number: code):\n${code}`
    }
  ];
}

/** JSON schema handed to the model's structured-output mode. */
export const LLM_FINDINGS_JSON_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ruleId: { type: "string" },
          line: { type: "number" },
          message: { type: "string" },
          suggestion: { type: "string" }
        },
        required: ["ruleId", "line", "message"]
      }
    }
  },
  required: ["findings"]
} as const;

const llmFindingSchema = z.object({
  ruleId: z.string(),
  line: z.coerce.number().int(),
  message: z.string().min(1),
  suggestion: z.string().optional()
});

const llmReplySchema = z.object({ findings: z.array(z.unknown()) });

/** Pulls the JSON object out of a reply that may be wrapped in prose or code fences. */
function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)?.[1];
  const text = (fenced ?? raw).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object found");
  return JSON.parse(text.slice(start, end + 1));
}

export interface BatchResult {
  findings: Finding[];
  /** Items the model returned that we rejected (bad shape, unknown rule or line). */
  dropped: number;
  error?: string;
}

/**
 * Validates an LLM reply against the batch. Never throws: bad output becomes
 * an `error`, and hallucinated rules or line numbers are dropped.
 */
export function parseLlmFindings(raw: string, batch: LlmBatch): BatchResult {
  let reply: z.infer<typeof llmReplySchema>;
  try {
    reply = llmReplySchema.parse(extractJson(raw));
  } catch (err) {
    return {
      findings: [],
      dropped: 0,
      error: `Unparseable LLM output: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  const rules = new Map(batch.rules.map((r) => [r.id, r]));
  const lines = new Map(batch.lines.map((l) => [l.line, l.content]));
  const seen = new Set<string>();
  const findings: Finding[] = [];
  let dropped = 0;

  for (const item of reply.findings) {
    const parsed = llmFindingSchema.safeParse(item);
    const rule = parsed.success ? rules.get(parsed.data.ruleId) : undefined;
    const content = parsed.success ? lines.get(parsed.data.line) : undefined;
    if (!parsed.success || !rule || content === undefined) {
      dropped++;
      continue;
    }
    const key = `${rule.id}:${parsed.data.line}`;
    if (seen.has(key)) continue;
    seen.add(key);

    findings.push({
      ruleId: rule.id,
      ruleTitle: rule.title,
      severity: rule.severity,
      file: batch.file,
      line: parsed.data.line,
      message: parsed.data.message,
      suggestion: parsed.data.suggestion || rule.fix,
      snippet: snippet(content),
      source: "llm"
    });
  }
  return { findings, dropped };
}

/** Runs one batch through the model. Transport errors propagate (so callers can retry). */
export async function evaluateBatch(
  batch: LlmBatch,
  complete: CompleteFn
): Promise<BatchResult> {
  const raw = await complete(buildBatchPrompt(batch));
  return parseLlmFindings(raw, batch);
}
