/**
 * MCP server so coding agents (Claude Code, Cursor, ...) can check a diff
 * against a team's codex before pushing. Stateless: each request reads the
 * codex from that team's GuardianAgent and runs the shared pipeline.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { getAgentByName } from "agents";
import { createMcpHandler } from "agents/mcp";
import { z } from "zod";
import { createRuleEvaluator } from "../llm/workers-ai";
import { evaluateBatch } from "../review/llm-rules";
import { parseUnifiedDiff } from "../review/patch";
import { isReviewablePath } from "../review/paths";
import { checkChanges } from "../review/pipeline";
import { formatReport } from "../review/report";
import { findingSchema } from "../shared/schemas";

/** Diff checks run inline (no workflow), so keep the LLM pass small. */
const MCP_BATCH_LIMITS = {
  maxLinesPerBatch: 120,
  maxRulesPerBatch: 4,
  maxBatches: 12
};
const MAX_DIFF_CHARS = 400_000;

const codexName = z
  .string()
  .regex(/^[\w-]{1,64}$/)
  .default("default")
  .describe("Team codex name (the ?codex= value in the web app)");

async function loadCodex(env: Env, name: string) {
  const agent = await getAgentByName(env.GuardianAgent, name);
  using snapshot = await agent.getCodexSnapshot();
  return { rules: [...snapshot.rules], exceptions: [...snapshot.exceptions] };
}

function text(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

function createServer(env: Env): McpServer {
  const server = new McpServer({ name: "codex-guardian", version: "1.0.0" });

  server.registerTool(
    "check_diff",
    {
      description:
        "Check a unified git diff (e.g. `git diff main`) against the team's engineering codex. Returns findings with file, line, rule and how to fix. Only added lines are checked.",
      inputSchema: z.object({
        diff: z.string().min(1).max(MAX_DIFF_CHARS),
        codex: codexName,
        useLlm: z
          .boolean()
          .default(true)
          .describe(
            "Also run LLM-judged rules (slower). False = regex rules only"
          )
      }),
      outputSchema: z.object({
        findings: z.array(findingSchema),
        suppressedCount: z.number(),
        filesReviewed: z.number(),
        warnings: z.array(z.string())
      })
    },
    async ({ diff, codex, useLlm }) => {
      const changes = parseUnifiedDiff(diff).filter((c) =>
        isReviewablePath(c.path)
      );
      const rules = await loadCodex(env, codex);
      const complete = createRuleEvaluator(env.AI);
      const result = await checkChanges(
        changes,
        rules,
        useLlm
          ? {
              limits: MCP_BATCH_LIMITS,
              runBatch: (batch) => evaluateBatch(batch, complete)
            }
          : undefined
      );
      const output = {
        findings: result.findings,
        suppressedCount: result.suppressedCount,
        filesReviewed: changes.length,
        warnings: result.warnings
      };
      return {
        ...text(
          formatReport({
            heading: `Codex Guardian check (codex: ${codex})`,
            ...output
          })
        ),
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "list_codex",
    {
      description: "List the team's codex rules and exceptions.",
      inputSchema: z.object({ codex: codexName })
    },
    async ({ codex }) => {
      const { rules, exceptions } = await loadCodex(env, codex);
      const lines = [
        `### Codex: ${codex}`,
        ...rules.map(
          (r) =>
            `- **${r.title}** (\`${r.id}\`, ${r.kind}, ${r.severity}): ${r.description}`
        ),
        exceptions.length > 0 ? "\n**Exceptions**" : "",
        ...exceptions.map(
          (e) => `- \`${e.ruleId}\` waived in \`${e.pathGlob}\`: ${e.reason}`
        )
      ];
      return text(lines.filter(Boolean).join("\n"));
    }
  );

  return server;
}

export function handleMcp(request: Request, env: Env, ctx: ExecutionContext) {
  const handler = createMcpHandler(() => createServer(env), { route: "/mcp" });
  return handler(request, env, ctx);
}
