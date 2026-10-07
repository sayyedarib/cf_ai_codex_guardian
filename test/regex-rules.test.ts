import { describe, expect, it } from "vitest";
import { runRegexRules, snippet } from "../src/review/regex-rules";
import { rule } from "./fixtures";

const files = [
  {
    path: "src/app.ts",
    addedLines: [
      { line: 3, content: "  console.log(user);" },
      { line: 4, content: "  logger.info(user);" }
    ]
  },
  {
    path: "docs/readme.md",
    addedLines: [{ line: 1, content: "console.log(x)" }]
  }
];

describe("runRegexRules", () => {
  it("reports each matching added line with file, line and rule", () => {
    const findings = runRegexRules(files, [rule({ appliesTo: ["**/*.ts"] })]);
    expect(findings).toEqual([
      expect.objectContaining({
        ruleId: "no-console-log",
        file: "src/app.ts",
        line: 3,
        snippet: "console.log(user);",
        suggestion: "Remove it.",
        source: "regex"
      })
    ]);
  });

  it("skips disabled rules, llm rules and invalid patterns", () => {
    const findings = runRegexRules(files, [
      rule({ enabled: false }),
      rule({ id: "judgement", kind: "llm", pattern: undefined }),
      rule({ id: "broken", pattern: "(" })
    ]);
    expect(findings).toEqual([]);
  });

  it("respects regex flags", () => {
    const shout = rule({ id: "shout", pattern: "CONSOLE", flags: "i" });
    expect(runRegexRules(files, [shout])).toHaveLength(2);
  });
});

describe("snippet", () => {
  it("trims and truncates long lines", () => {
    expect(snippet("   x  ")).toBe("x");
    expect(snippet("a".repeat(300))).toHaveLength(201);
  });
});
