/**
 * The rule-checking pipeline shared by the PR review workflow and the MCP
 * diff check. How each LLM batch runs is injected (`runBatch`), so the
 * workflow can wrap it in a durable step and the MCP server can call the
 * model directly.
 */
import type { CodexException, Finding, Rule } from "../shared/schemas";
import { applyExceptions } from "./exceptions";
import {
  buildLlmBatches,
  DEFAULT_BATCH_LIMITS,
  type BatchLimits,
  type BatchResult,
  type LlmBatch
} from "./llm-rules";
import { sortAndDedupe } from "./report";
import { runRegexRules } from "./regex-rules";
import type { FileChange } from "./types";

export interface LlmPassOptions {
  runBatch: (batch: LlmBatch, index: number) => Promise<BatchResult>;
  /** Batches run this many at a time. */
  concurrency?: number;
  limits?: BatchLimits;
  onProgress?: (done: number, total: number) => Promise<void> | void;
}

export interface LlmPassResult {
  findings: Finding[];
  warnings: string[];
}

/** Runs LLM rules in batches. A batch that throws or returns bad output is noted, never fatal. */
export async function runLlmRules(
  changes: readonly FileChange[],
  rules: readonly Rule[],
  options: LlmPassOptions
): Promise<LlmPassResult> {
  const concurrency = options.concurrency ?? 4;
  const { batches, truncated } = buildLlmBatches(
    changes,
    rules,
    options.limits ?? DEFAULT_BATCH_LIMITS
  );
  const findings: Finding[] = [];
  const warnings: string[] = [];
  if (truncated) {
    warnings.push(
      `LLM checks were capped at ${batches.length} batches; some lines were only checked by regex rules.`
    );
  }

  let failed = 0;
  let dropped = 0;
  for (let i = 0; i < batches.length; i += concurrency) {
    const group = batches.slice(i, i + concurrency);
    const results = await Promise.all(
      group.map((batch, j) =>
        options.runBatch(batch, i + j).catch((err): BatchResult => ({
          findings: [],
          dropped: 0,
          error: err instanceof Error ? err.message : String(err)
        }))
      )
    );
    for (const result of results) {
      findings.push(...result.findings);
      dropped += result.dropped;
      if (result.error) failed++;
    }
    await options.onProgress?.(i + group.length, batches.length);
  }

  if (failed > 0) {
    warnings.push(
      `${failed} of ${batches.length} LLM batches failed and were skipped.`
    );
  }
  if (dropped > 0) {
    warnings.push(
      `${dropped} LLM finding(s) were discarded as invalid (unknown rule or line).`
    );
  }
  return { findings, warnings };
}

export interface CheckResult {
  findings: Finding[];
  suppressedCount: number;
  warnings: string[];
}

/** Regex rules, then (optionally) LLM rules, then exceptions. */
export async function checkChanges(
  changes: readonly FileChange[],
  codex: { rules: readonly Rule[]; exceptions: readonly CodexException[] },
  llm?: LlmPassOptions
): Promise<CheckResult> {
  const regexFindings = runRegexRules(changes, codex.rules);
  const llmPass = llm
    ? await runLlmRules(changes, codex.rules, llm)
    : { findings: [], warnings: [] };
  const { kept, suppressed } = applyExceptions(
    [...regexFindings, ...llmPass.findings],
    codex.exceptions
  );
  return {
    findings: sortAndDedupe(kept),
    suppressedCount: suppressed.length,
    warnings: llmPass.warnings
  };
}
