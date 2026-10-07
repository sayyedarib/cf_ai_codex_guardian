import type { Finding, Rule } from "../shared/schemas";
import { matchesAnyGlob } from "./paths";
import type { FileChange } from "./types";

/** Lines longer than this are truncated in findings to keep reports readable. */
const MAX_SNIPPET = 200;

export function snippet(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > MAX_SNIPPET
    ? `${trimmed.slice(0, MAX_SNIPPET)}…`
    : trimmed;
}

/** Runs every enabled regex rule against the added lines it applies to. */
export function runRegexRules(
  files: readonly FileChange[],
  rules: readonly Rule[]
): Finding[] {
  const compiled = rules
    .filter((rule) => rule.enabled && rule.kind === "regex" && rule.pattern)
    .flatMap((rule) => {
      try {
        return [{ rule, regex: new RegExp(rule.pattern!, rule.flags ?? "") }];
      } catch {
        return []; // Invalid patterns are rejected on creation; skip defensively.
      }
    });

  const findings: Finding[] = [];
  for (const file of files) {
    for (const { rule, regex } of compiled) {
      if (!matchesAnyGlob(file.path, rule.appliesTo)) continue;
      for (const { line, content } of file.addedLines) {
        if (!regex.test(content)) continue;
        findings.push({
          ruleId: rule.id,
          ruleTitle: rule.title,
          severity: rule.severity,
          file: file.path,
          line,
          message: rule.description,
          suggestion: rule.fix,
          snippet: snippet(content),
          source: "regex"
        });
      }
    }
  }
  return findings;
}
