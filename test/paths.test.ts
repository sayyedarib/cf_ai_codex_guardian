import { describe, expect, it } from "vitest";
import {
  isReviewablePath,
  matchesAnyGlob,
  matchesGlob
} from "../src/review/paths";

describe("matchesGlob", () => {
  it.each([
    ["src/a.ts", "**/*", true],
    ["src/a.ts", "src/*.ts", true],
    ["src/deep/a.ts", "src/*.ts", false],
    ["src/deep/a.ts", "src/**/*.ts", true],
    ["src/a.ts", "src/**/*.ts", true],
    ["src/a.tsx", "**/*.{ts,tsx}", true],
    ["src/a.js", "**/*.{ts,tsx}", false],
    ["scripts/build/run.js", "scripts/**", true],
    ["src/scripts/run.js", "scripts/**", false],
    ["a/b/c.test.ts", "*.test.ts", true],
    ["file1.ts", "file?.ts", true],
    ["file10.ts", "file?.ts", false],
    ["src/a.ts", "src/a.ts", true],
    ["src/a+b.ts", "src/a+b.ts", true]
  ])("%s vs %s -> %s", (path, glob, expected) => {
    expect(matchesGlob(path, glob)).toBe(expected);
  });

  it("matches if any glob matches", () => {
    expect(matchesAnyGlob("docs/x.md", ["**/*.ts", "docs/**"])).toBe(true);
    expect(matchesAnyGlob("docs/x.md", ["**/*.ts"])).toBe(false);
  });
});

describe("isReviewablePath", () => {
  it.each([
    ["src/index.ts", true],
    ["package-lock.json", false],
    ["apps/web/pnpm-lock.yaml", false],
    ["dist/bundle.js", false],
    ["public/app.min.js", false],
    ["vendor/lib/x.go", false],
    ["src/distance.ts", true]
  ])("%s -> %s", (path, expected) => {
    expect(isReviewablePath(path)).toBe(expected);
  });
});
