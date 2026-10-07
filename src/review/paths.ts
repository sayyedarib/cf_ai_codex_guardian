/**
 * Minimal glob matching for rule scopes and exceptions.
 * Supports `**`, `*`, `?` and `{a,b}`. Globs match at any depth, the way
 * people phrase them in chat: `scripts/**` matches `tools/scripts/x.js` and
 * `*.ts` matches `src/a.ts`. A leading `/` anchors the glob to the repo root.
 */

const cache = new Map<string, RegExp>();

function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*") {
      if (glob[i + 1] === "*") {
        // `**/` matches zero or more directories; a bare `**` matches anything.
        if (glob[i + 2] === "/") {
          source += "(?:.*/)?";
          i += 2;
        } else {
          source += ".*";
          i += 1;
        }
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else if (char === "{") {
      const end = glob.indexOf("}", i);
      if (end === -1) {
        source += "\\{";
        continue;
      }
      const options = glob
        .slice(i + 1, end)
        .split(",")
        .map(escapeRegExp);
      source += `(?:${options.join("|")})`;
      i = end;
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`^${source}$`);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

export function matchesGlob(path: string, glob: string): boolean {
  const anchored = glob.startsWith("/");
  const pattern = anchored ? glob.slice(1) : glob;
  if (compile(pattern).test(path)) return true;
  return (
    !anchored &&
    !pattern.startsWith("**/") &&
    compile(`**/${pattern}`).test(path)
  );
}

function compile(glob: string): RegExp {
  let regex = cache.get(glob);
  if (!regex) {
    regex = globToRegExp(glob);
    cache.set(glob, regex);
  }
  return regex;
}

export function matchesAnyGlob(path: string, globs: readonly string[]) {
  return globs.some((glob) => matchesGlob(path, glob));
}

/** Files that are noise in a review: lockfiles, build output, minified or vendored code. */
const IGNORED_GLOBS = [
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/bun.lock",
  "**/bun.lockb",
  "**/Cargo.lock",
  "**/poetry.lock",
  "**/go.sum",
  "**/*.min.{js,css}",
  "**/*.map",
  "**/*.snap",
  "**/{dist,build,vendor,node_modules}/**"
];

export function isReviewablePath(path: string): boolean {
  return !matchesAnyGlob(path, IGNORED_GLOBS);
}
