import { ANY_RULE, type CodexException, type Finding } from "../shared/schemas";
import { matchesGlob } from "./paths";

export function exceptionCovers(ex: CodexException, finding: Finding) {
  const ruleMatches = ex.ruleId === ANY_RULE || ex.ruleId === finding.ruleId;
  return ruleMatches && matchesGlob(finding.file, ex.pathGlob);
}

/** Splits findings into those to report and those an exception waives. */
export function applyExceptions(
  findings: readonly Finding[],
  exceptions: readonly CodexException[]
): { kept: Finding[]; suppressed: Finding[] } {
  const kept: Finding[] = [];
  const suppressed: Finding[] = [];
  for (const finding of findings) {
    const covered = exceptions.some((ex) => exceptionCovers(ex, finding));
    (covered ? suppressed : kept).push(finding);
  }
  return { kept, suppressed };
}
