import { describe, expect, it } from "vitest";
import { applyExceptions } from "../src/review/exceptions";
import {
  COMMENT_MARKER,
  formatPrComment,
  formatReviewMarkdown,
  sortAndDedupe,
  summaryLine
} from "../src/review/report";
import { applyOutcome, createReviewRecord } from "../src/review/review-record";
import { exception, finding } from "./fixtures";

describe("applyExceptions", () => {
  const inScripts = finding({ file: "scripts/build.js" });
  const inSrc = finding({ file: "src/app.ts" });
  const otherRule = finding({ ruleId: "no-any", file: "scripts/x.ts" });

  it("waives findings of the excepted rule in matching files only", () => {
    const { kept, suppressed } = applyExceptions(
      [inScripts, inSrc, otherRule],
      [exception()]
    );
    expect(suppressed).toEqual([inScripts]);
    expect(kept).toEqual([inSrc, otherRule]);
  });

  it("supports the * wildcard rule", () => {
    const { kept } = applyExceptions(
      [inScripts, otherRule, inSrc],
      [exception({ ruleId: "*" })]
    );
    expect(kept).toEqual([inSrc]);
  });

  it("keeps everything when there are no exceptions", () => {
    expect(applyExceptions([inSrc], []).kept).toEqual([inSrc]);
  });
});

describe("report", () => {
  it("sorts by severity, file and line, and removes duplicates", () => {
    const sorted = sortAndDedupe([
      finding({ severity: "info", file: "a.ts", line: 1 }),
      finding({ severity: "error", file: "b.ts", line: 9 }),
      finding({ severity: "error", file: "b.ts", line: 2 }),
      finding({ severity: "error", file: "b.ts", line: 2 })
    ]);
    expect(sorted.map((f) => `${f.severity}:${f.line}`)).toEqual([
      "error:2",
      "error:9",
      "info:1"
    ]);
  });

  it("summarises counts", () => {
    expect(summaryLine([])).toMatch(/No codex violations/);
    expect(
      summaryLine([finding({ severity: "error" }), finding(), finding()])
    ).toBe("3 findings: 1 error, 2 warnings");
  });

  it("formats each finding with file:line, rule and fix", () => {
    const review = applyOutcome(
      createReviewRecord(
        "rev-1",
        { owner: "acme", repo: "app", number: 7 },
        false,
        new Date("2026-01-01")
      ),
      {
        title: "Add login",
        headSha: "abc",
        filesReviewed: 1,
        findings: [finding({ suggestion: "Use the logger.", snippet: "a`b" })],
        suppressedCount: 2,
        warnings: ["1 of 3 LLM batches failed and were skipped."]
      }
    );
    const md = formatReviewMarkdown(review);
    expect(md).toContain("[acme/app#7](https://github.com/acme/app/pull/7)");
    expect(md).toContain("`src/a.ts:1`");
    expect(md).toContain("**No console.log** (`no-console-log`)");
    expect(md).toContain("**Fix:** Use the logger.");
    expect(md).toContain("`a'b`"); // backticks in code can't break the markdown
    expect(md).toContain("2 finding(s) waived");
    expect(md).toContain("LLM batches failed");
    expect(formatPrComment(review).startsWith(COMMENT_MARKER)).toBe(true);
  });
});
