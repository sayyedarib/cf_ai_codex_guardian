import type {
  Finding,
  PullRequestRef,
  ReviewRecord,
  Severity
} from "../shared/schemas";

const SEVERITY_ORDER: Severity[] = ["error", "warning", "info"];
const SEVERITY_ICON: Record<Severity, string> = {
  error: "🔴",
  warning: "🟡",
  info: "🔵"
};

/** Hidden marker so a future update could find and edit our own comment. */
export const COMMENT_MARKER = "<!-- codex-guardian -->";

/** Upper bound on findings kept per review, so reports and state stay small. */
export const MAX_FINDINGS = 150;

export function prLabel(pr: PullRequestRef): string {
  return `${pr.owner}/${pr.repo}#${pr.number}`;
}

export function prUrl(pr: PullRequestRef): string {
  return `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}`;
}

export function countBySeverity(findings: readonly Finding[]) {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

/** Most severe first, then by file and line, with exact duplicates removed. */
export function sortAndDedupe(findings: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings
    .filter((f) => {
      const key = `${f.ruleId}|${f.file}|${f.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) -
          SEVERITY_ORDER.indexOf(b.severity) ||
        a.file.localeCompare(b.file) ||
        a.line - b.line
    );
}

export function summaryLine(findings: readonly Finding[]): string {
  if (findings.length === 0) return "No codex violations found. ✅";
  const counts = countBySeverity(findings);
  const parts = SEVERITY_ORDER.filter((s) => counts[s] > 0).map(
    (s) => `${counts[s]} ${s}${counts[s] === 1 ? "" : "s"}`
  );
  return `${findings.length} finding${findings.length === 1 ? "" : "s"}: ${parts.join(", ")}`;
}

function formatFinding(f: Finding): string {
  const fix = f.suggestion ? `\n  - **Fix:** ${f.suggestion}` : "";
  return `- ${SEVERITY_ICON[f.severity]} \`${f.file}:${f.line}\` — **${f.ruleTitle}** (\`${f.ruleId}\`)\n  - ${f.message}\n  - \`${f.snippet.replace(/`/g, "'")}\`${fix}`;
}

/** Markdown report used both in chat and as the PR comment body. */
export function formatReviewMarkdown(review: ReviewRecord): string {
  const lines = [
    `### Codex Guardian review of [${prLabel(review.pr)}](${prUrl(review.pr)})`,
    review.title ? `_${review.title}_` : "",
    "",
    `**${summaryLine(review.findings)}** · ${review.filesReviewed} file${review.filesReviewed === 1 ? "" : "s"} reviewed`,
    review.suppressedCount > 0
      ? `${review.suppressedCount} finding(s) waived by codex exceptions.`
      : "",
    "",
    ...review.findings.map(formatFinding)
  ];
  if (review.warnings.length > 0) {
    lines.push("", "<details><summary>Review notes</summary>", "");
    lines.push(...review.warnings.map((w) => `- ${w}`), "", "</details>");
  }
  return lines
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n")
    .trim();
}

export function formatPrComment(review: ReviewRecord): string {
  return `${COMMENT_MARKER}\n${formatReviewMarkdown(review)}`;
}
