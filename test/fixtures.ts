import type { CodexException, Finding, Rule } from "../src/shared/schemas";

export function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: "no-console-log",
    title: "No console.log",
    description: "Debug logging must not be committed.",
    kind: "regex",
    pattern: "\\bconsole\\.log\\(",
    appliesTo: ["**/*"],
    severity: "warning",
    fix: "Remove it.",
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

export function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: "no-console-log",
    ruleTitle: "No console.log",
    severity: "warning",
    file: "src/a.ts",
    line: 1,
    message: "Debug logging must not be committed.",
    snippet: "console.log(x)",
    source: "regex",
    ...overrides
  };
}

export function exception(
  overrides: Partial<CodexException> = {}
): CodexException {
  return {
    id: "ex-1",
    ruleId: "no-console-log",
    pathGlob: "scripts/**",
    reason: "Scripts print to the terminal.",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}
