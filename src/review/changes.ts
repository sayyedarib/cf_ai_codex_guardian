import { parseAddedLines } from "./patch";
import { isReviewablePath } from "./paths";
import type { FileChange } from "./types";

export interface RawFile {
  path: string;
  status: string;
  patch?: string;
}

/**
 * Turns raw PR files into reviewable changes. Removed files, ignored paths
 * (lockfiles, build output) and files without a patch (binary or too large)
 * are skipped and listed so the report can mention them.
 */
export function toFileChanges(files: readonly RawFile[]): {
  changes: FileChange[];
  skipped: string[];
} {
  const changes: FileChange[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (file.status === "removed" || !isReviewablePath(file.path)) continue;
    if (!file.patch) {
      skipped.push(file.path);
      continue;
    }
    const addedLines = parseAddedLines(file.patch);
    if (addedLines.length > 0) changes.push({ path: file.path, addedLines });
  }
  return { changes, skipped };
}
