import { describe, expect, it } from "vitest";
import { parsePullRequestRef } from "../src/github/pr-ref";
import { slugify, uniqueSlug } from "../src/shared/ids";
import { newRuleSchema } from "../src/shared/schemas";

describe("parsePullRequestRef", () => {
  it.each([
    [
      "https://github.com/cloudflare/agents/pull/42",
      { owner: "cloudflare", repo: "agents", number: 42 }
    ],
    ["github.com/a/b.js/pull/7/files", { owner: "a", repo: "b.js", number: 7 }],
    ["  acme/web-app#12 ", { owner: "acme", repo: "web-app", number: 12 }]
  ])("parses %s", (input, expected) => {
    expect(parsePullRequestRef(input)).toEqual(expected);
  });

  it.each([
    "https://github.com/a/b/issues/3",
    "acme/web#0",
    "review my PR",
    "https://gitlab.com/a/b/pull/1"
  ])("rejects %s", (input) => {
    expect(parsePullRequestRef(input)).toBeNull();
  });
});

describe("ids", () => {
  it("slugifies titles", () => {
    expect(slugify("No console.log!")).toBe("no-console-log");
    expect(slugify("!!!")).toBe("rule");
  });

  it("avoids collisions", () => {
    expect(uniqueSlug("No any", new Set(["no-any", "no-any-2"]))).toBe(
      "no-any-3"
    );
  });
});

describe("newRuleSchema", () => {
  const base = {
    title: "No TODO",
    description: "Track work in tickets.",
    severity: "info" as const
  };

  it("defaults appliesTo to all files", () => {
    const rule = newRuleSchema.parse({ ...base, kind: "llm" });
    expect(rule.appliesTo).toEqual(["**/*"]);
  });

  it("requires a valid pattern for regex rules", () => {
    expect(newRuleSchema.safeParse({ ...base, kind: "regex" }).success).toBe(
      false
    );
    expect(
      newRuleSchema.safeParse({ ...base, kind: "regex", pattern: "(" }).success
    ).toBe(false);
    expect(
      newRuleSchema.safeParse({ ...base, kind: "regex", pattern: "TODO" })
        .success
    ).toBe(true);
  });

  it("rejects stateful regex flags", () => {
    expect(
      newRuleSchema.safeParse({
        ...base,
        kind: "regex",
        pattern: "x",
        flags: "g"
      }).success
    ).toBe(false);
  });
});
