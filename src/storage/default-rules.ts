import type { NewRule } from "../shared/schemas";

const CODE = "**/*.{ts,tsx,js,jsx,mjs,cjs}";

/** Starter codex seeded into a new team so the first review has something to check. */
export const DEFAULT_RULES: NewRule[] = [
  {
    title: "No console.log",
    description: "Debug logging must not be committed.",
    kind: "regex",
    pattern: "\\bconsole\\.log\\(",
    appliesTo: [CODE],
    severity: "warning",
    fix: "Remove it, or use the project's logger."
  },
  {
    title: "No hardcoded secrets",
    description:
      "Credentials, API keys and tokens must never be committed to source.",
    kind: "regex",
    pattern:
      "(api[_-]?key|secret|password|passwd|token)\\s*[:=]\\s*['\"][^'\"\\s]{8,}['\"]",
    flags: "i",
    appliesTo: ["**/*"],
    severity: "error",
    fix: "Load it from an environment variable or secret store and rotate the leaked value."
  },
  {
    title: "No explicit any",
    description:
      "`any` disables type checking; use a precise type or `unknown`.",
    kind: "regex",
    pattern: "(:\\s*any\\b|\\bas any\\b|<any>)",
    appliesTo: ["**/*.{ts,tsx}"],
    severity: "warning",
    fix: "Replace with a concrete type, a generic, or `unknown` plus narrowing."
  },
  {
    title: "Errors must be handled",
    description:
      "Async calls and external I/O must handle failures. Empty catch blocks or catches that only swallow the error are not allowed.",
    kind: "llm",
    appliesTo: [CODE],
    severity: "error",
    fix: "Handle the error explicitly: log it with context, rethrow, or return a typed failure."
  },
  {
    title: "No SQL injection",
    description:
      "SQL must use bound parameters. Never build SQL by concatenating or interpolating user input.",
    kind: "llm",
    appliesTo: ["**/*"],
    severity: "error",
    fix: "Use parameterized queries / prepared statements."
  },
  {
    title: "Descriptive names",
    description:
      "Variables and functions need meaningful names. Avoid vague names like data2, tmp, foo or single letters outside short loops.",
    kind: "llm",
    appliesTo: [CODE],
    severity: "info",
    fix: "Rename to describe what the value holds or what the function does."
  }
];
