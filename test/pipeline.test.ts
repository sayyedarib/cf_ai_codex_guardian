import { describe, expect, it, vi } from "vitest";
import { checkChanges, runLlmRules } from "../src/review/pipeline";
import { exception, finding, rule } from "./fixtures";

const llmRule = rule({ id: "handle-errors", kind: "llm", pattern: undefined });
const changes = [
  {
    path: "src/app.ts",
    addedLines: [
      { line: 1, content: "console.log(x)" },
      { line: 2, content: "catch {}" }
    ]
  },
  {
    path: "scripts/build.js",
    addedLines: [{ line: 5, content: "console.log('building')" }]
  }
];

describe("runLlmRules", () => {
  it("collects findings, and turns thrown or bad batches into warnings", async () => {
    const runBatch = vi
      .fn()
      .mockResolvedValueOnce({
        findings: [
          finding({ ruleId: "handle-errors", line: 2, source: "llm" })
        ],
        dropped: 1
      })
      .mockRejectedValueOnce(new Error("AI unavailable"));
    const onProgress = vi.fn();

    const result = await runLlmRules(changes, [llmRule], {
      runBatch,
      onProgress
    });

    expect(runBatch).toHaveBeenCalledTimes(2);
    expect(runBatch.mock.calls.map((c) => c[1])).toEqual([0, 1]);
    expect(result.findings).toHaveLength(1);
    expect(result.warnings).toEqual([
      "1 of 2 LLM batches failed and were skipped.",
      "1 LLM finding(s) were discarded as invalid (unknown rule or line)."
    ]);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });

  it("respects concurrency", async () => {
    let running = 0;
    let peak = 0;
    const runBatch = async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return { findings: [], dropped: 0 };
    };
    const many = Array.from({ length: 5 }, (_, i) => ({
      path: `f${i}.ts`,
      addedLines: [{ line: 1, content: "x" }]
    }));
    await runLlmRules(many, [llmRule], { runBatch, concurrency: 2 });
    expect(peak).toBe(2);
  });
});

describe("checkChanges", () => {
  it("runs regex rules, applies exceptions and sorts", async () => {
    const result = await checkChanges(changes, {
      rules: [rule()],
      exceptions: [exception({ pathGlob: "scripts/**" })]
    });
    expect(result.findings.map((f) => `${f.file}:${f.line}`)).toEqual([
      "src/app.ts:1"
    ]);
    expect(result.suppressedCount).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it("skips LLM rules when no LLM options are given", async () => {
    const result = await checkChanges(changes, {
      rules: [llmRule],
      exceptions: []
    });
    expect(result.findings).toEqual([]);
  });
});
