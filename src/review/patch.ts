import type { AddedLine, FileChange } from "./types";

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Extracts the added lines (with their new-file line numbers) from a
 * unified-diff patch, as returned by GitHub's PR files API.
 */
export function parseAddedLines(patch: string): AddedLine[] {
  const added: AddedLine[] = [];
  let nextLine = 0;
  let inHunk = false;

  for (const raw of patch.split("\n")) {
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      nextLine = Number(header[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;

    if (raw.startsWith("+")) {
      added.push({ line: nextLine, content: raw.slice(1) });
      nextLine++;
    } else if (raw.startsWith(" ") || raw === "") {
      nextLine++;
    }
    // "-" lines don't exist in the new file; "\ No newline" is metadata.
  }
  return added;
}

/**
 * Splits a full `git diff` into per-file changes. Deleted files are skipped
 * because they add no lines.
 */
export function parseUnifiedDiff(diff: string): FileChange[] {
  const files: FileChange[] = [];
  const sections = diff.split(/^diff --git /m).slice(1);

  for (const section of sections) {
    const target = /^\+\+\+ (?:b\/)?(.+)$/m.exec(section)?.[1]?.trim();
    if (!target || target === "/dev/null") continue;
    const hunkStart = section.search(/^@@ /m);
    if (hunkStart === -1) continue;
    files.push({
      path: target,
      addedLines: parseAddedLines(section.slice(hunkStart))
    });
  }
  return files;
}
