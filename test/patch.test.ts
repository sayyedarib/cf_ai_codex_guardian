import { describe, expect, it } from "vitest";
import { parseAddedLines, parseUnifiedDiff } from "../src/review/patch";
import { toFileChanges } from "../src/review/changes";

describe("parseAddedLines", () => {
  it("numbers added lines using the new-file side of the hunk header", () => {
    const patch = [
      "@@ -10,4 +10,5 @@ function main() {",
      " const a = 1;",
      "-const b = 2;",
      "+const b = 3;",
      "+console.log(b);",
      " return a;"
    ].join("\n");

    expect(parseAddedLines(patch)).toEqual([
      { line: 11, content: "const b = 3;" },
      { line: 12, content: "console.log(b);" }
    ]);
  });

  it("handles multiple hunks and the no-newline marker", () => {
    const patch = [
      "@@ -1,2 +1,2 @@",
      "-old",
      "+new",
      " same",
      "@@ -50 +50,2 @@",
      " keep",
      "+added",
      "\\ No newline at end of file"
    ].join("\n");

    expect(parseAddedLines(patch)).toEqual([
      { line: 1, content: "new" },
      { line: 51, content: "added" }
    ]);
  });

  it("returns nothing for a deletion-only patch", () => {
    expect(parseAddedLines("@@ -1,2 +0,0 @@\n-a\n-b")).toEqual([]);
  });

  it("ignores text before the first hunk", () => {
    expect(parseAddedLines("+++ b/file.ts\n@@ -0,0 +1 @@\n+x")).toEqual([
      { line: 1, content: "x" }
    ]);
  });
});

describe("parseUnifiedDiff", () => {
  it("splits a git diff into files and skips deleted files", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 111..222 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1,2 @@",
      " x",
      "+y",
      "diff --git a/old.ts b/old.ts",
      "deleted file mode 100644",
      "--- a/old.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-gone",
      "diff --git a/new.ts b/new.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/new.ts",
      "@@ -0,0 +1 @@",
      "+fresh"
    ].join("\n");

    expect(parseUnifiedDiff(diff)).toEqual([
      { path: "src/a.ts", addedLines: [{ line: 2, content: "y" }] },
      { path: "new.ts", addedLines: [{ line: 1, content: "fresh" }] }
    ]);
  });
});

describe("toFileChanges", () => {
  it("skips removed files and lockfiles, and reports files without a patch", () => {
    const result = toFileChanges([
      { path: "src/a.ts", status: "modified", patch: "@@ -0,0 +1 @@\n+a" },
      { path: "src/gone.ts", status: "removed", patch: "@@ -1 +0,0 @@\n-a" },
      {
        path: "package-lock.json",
        status: "modified",
        patch: "@@ -0,0 +1 @@\n+x"
      },
      { path: "logo.png", status: "added" }
    ]);
    expect(result.changes.map((c) => c.path)).toEqual(["src/a.ts"]);
    expect(result.skipped).toEqual(["logo.png"]);
  });
});
