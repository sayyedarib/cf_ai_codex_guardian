import { describe, expect, it, vi } from "vitest";
import {
  buildBatchPrompt,
  buildLlmBatches,
  evaluateBatch,
  parseLlmFindings,
  type LlmBatch
} from "../src/review/llm-rules";
import { rule } from "./fixtures";

const errorsRule = rule({
  id: "handle-errors",
  title: "Errors must be handled",
  description: "No empty catch blocks.",
  kind: "llm",
  pattern: undefined,
  severity: "error",
  fix: "Handle the error."
});

const batch: LlmBatch = {
  file: "src/api.ts",
  lines: [
    { line: 10, content: "try { await save(); }" },
    { line: 11, content: "catch {}" }
  ],
  rules: [errorsRule]
};

describe("buildLlmBatches", () => {
  const lines = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ line: i + 1, content: `x${i}` }));

  it("splits by lines and rules, and only uses enabled llm rules that apply", () => {
    const rules = [
      errorsRule,
      rule({ id: "r2", kind: "llm" }),
      rule({ id: "r3", kind: "llm" }),
      rule({ id: "off", kind: "llm", enabled: false }),
      rule({ id: "regex-only" }),
      rule({ id: "md-only", kind: "llm", appliesTo: ["**/*.md"] })
    ];
    const { batches, truncated } = buildLlmBatches(
      [{ path: "src/a.ts", addedLines: lines(5) }],
      rules,
      { maxLinesPerBatch: 3, maxRulesPerBatch: 2, maxBatches: 10 }
    );
    expect(truncated).toBe(false);
    // 2 line chunks x 2 rule groups
    expect(batches).toHaveLength(4);
    expect(batches[0].rules.map((r) => r.id)).toEqual(["handle-errors", "r2"]);
    expect(batches[1].rules.map((r) => r.id)).toEqual(["r3"]);
    expect(batches[2].lines.map((l) => l.line)).toEqual([4, 5]);
  });

  it("stops at maxBatches and says so", () => {
    const { batches, truncated } = buildLlmBatches(
      [{ path: "a.ts", addedLines: lines(10) }],
      [errorsRule],
      { maxLinesPerBatch: 1, maxRulesPerBatch: 1, maxBatches: 3 }
    );
    expect(batches).toHaveLength(3);
    expect(truncated).toBe(true);
  });
});

describe("buildBatchPrompt", () => {
  it("includes rule ids and numbered lines", () => {
    const [system, user] = buildBatchPrompt(batch);
    expect(system.role).toBe("system");
    expect(user.content).toContain("- handle-errors: Errors must be handled.");
    expect(user.content).toContain("11: catch {}");
    expect(user.content).toContain("File: src/api.ts");
  });
});

describe("parseLlmFindings", () => {
  it("accepts a valid reply and enriches it from the rule and line", () => {
    const raw = JSON.stringify({
      findings: [{ ruleId: "handle-errors", line: 11, message: "Empty catch." }]
    });
    const result = parseLlmFindings(raw, batch);
    expect(result.error).toBeUndefined();
    expect(result.findings).toEqual([
      {
        ruleId: "handle-errors",
        ruleTitle: "Errors must be handled",
        severity: "error",
        file: "src/api.ts",
        line: 11,
        message: "Empty catch.",
        suggestion: "Handle the error.",
        snippet: "catch {}",
        source: "llm"
      }
    ]);
  });

  it("extracts JSON from code fences and surrounding prose", () => {
    const raw =
      'Sure! Here you go:\n```json\n{"findings": [{"ruleId": "handle-errors", "line": "11", "message": "x"}]}\n```';
    expect(parseLlmFindings(raw, batch).findings).toHaveLength(1);
  });

  it("drops hallucinated rules, lines outside the batch, bad items and duplicates", () => {
    const raw = JSON.stringify({
      findings: [
        { ruleId: "made-up", line: 11, message: "x" },
        { ruleId: "handle-errors", line: 99, message: "x" },
        { ruleId: "handle-errors", message: "no line" },
        "garbage",
        { ruleId: "handle-errors", line: 10, message: "ok" },
        { ruleId: "handle-errors", line: 10, message: "dupe" }
      ]
    });
    const result = parseLlmFindings(raw, batch);
    expect(result.findings.map((f) => f.line)).toEqual([10]);
    expect(result.dropped).toBe(4);
  });

  it.each([
    "",
    "I could not find anything.",
    "{not json}",
    '{"results": []}',
    "null"
  ])("never throws on bad output: %j", (raw) => {
    const result = parseLlmFindings(raw, batch);
    expect(result.findings).toEqual([]);
    expect(result.error).toMatch(/Unparseable LLM output/);
  });

  it("treats an empty findings list as a clean result", () => {
    expect(parseLlmFindings('{"findings": []}', batch)).toEqual({
      findings: [],
      dropped: 0
    });
  });
});

describe("evaluateBatch", () => {
  it("sends the prompt to the injected model and parses the reply", async () => {
    const complete = vi.fn().mockResolvedValue('{"findings": []}');
    await expect(evaluateBatch(batch, complete)).resolves.toEqual({
      findings: [],
      dropped: 0
    });
    expect(complete).toHaveBeenCalledWith(buildBatchPrompt(batch));
  });

  it("lets transport errors propagate so the workflow step can retry", async () => {
    const complete = vi.fn().mockRejectedValue(new Error("network"));
    await expect(evaluateBatch(batch, complete)).rejects.toThrow("network");
  });
});
