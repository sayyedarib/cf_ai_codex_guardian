/**
 * Minimal glob matching for rule scopes and exceptions.
 * Supports `**`, `*`, `?` and `{a,b}`. A glob without a `/` matches the file
 * name in any directory (like .gitignore), so `*.ts` matches `src/a.ts`.
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
  let regex = cache.get(glob);
  if (!regex) {
    regex = globToRegExp(glob);
    cache.set(glob, regex);
  }
  if (regex.test(path)) return true;
  if (!glob.includes("/")) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    return regex.test(name);
  }
  return false;
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
