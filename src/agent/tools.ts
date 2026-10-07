/**
 * Chat tools the model can call. Each one is a thin adapter over a
 * GuardianAgent method; validation and persistence live in the agent/store.
 */
import { tool } from "ai";
import { z } from "zod";
import { severitySchema } from "../shared/schemas";
import type { GuardianAgent } from "./guardian-agent";

/** Returns errors as data so the model can explain them instead of the turn failing. */
async function safely<T>(work: () => T | Promise<T>) {
  try {
    return await work();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/*
 * Tool design notes for Llama 3.3: flat schemas with few optional fields get
 * structured tool calls far more reliably. That's why adding a rule is split
 * into two tools instead of one tool with a `kind` switch.
 */
const appliesToSchema = z
  .array(z.string())
  .optional()
  .describe("File globs it applies to, e.g. ['**/*.ts']. Omit for all files");
const fixSchema = z.string().optional().describe("How to fix a violation");

/** Llama sometimes sends booleans as "true"/"false" strings; accept both. */
const looseBoolean = z.preprocess(
  (value) => (value === "true" ? true : value === "false" ? false : value),
  z.boolean()
);

export function createGuardianTools(agent: GuardianAgent) {
  return {
    listCodex: tool({
      description:
        "List the team's codex: all rules (with ids) and all exceptions. Call this before changing or referring to rules by id.",
      inputSchema: z.object({}),
      execute: async () =>
        safely(() => {
          const { rules, exceptions } = agent.codexOverview();
          return { rules, exceptions };
        })
    }),

    addRegexRule: tool({
      description:
        "Add a rule detectable by a regular expression on a single line of code, such as a banned function call, keyword, import or hardcoded value.",
      inputSchema: z.object({
        title: z.string().describe("Short name"),
        description: z.string().describe("What the rule requires"),
        pattern: z
          .string()
          .describe(
            "JavaScript regular expression source matched against each added line"
          ),
        severity: severitySchema,
        appliesTo: appliesToSchema,
        fix: fixSchema
      }),
      execute: async (input) =>
        safely(() => agent.addRule({ ...input, kind: "regex" }))
    }),

    addLlmRule: tool({
      description:
        "Add a rule that needs judgement or context to check, such as documentation, naming, error handling, security or design practices. An AI reviewer checks it.",
      inputSchema: z.object({
        title: z.string().describe("Short name"),
        description: z.string().describe("What the rule requires"),
        severity: severitySchema,
        appliesTo: appliesToSchema,
        fix: fixSchema
      }),
      execute: async (input) =>
        safely(() => agent.addRule({ ...input, kind: "llm" }))
    }),

    updateRule: tool({
      description:
        "Change an existing rule: enable/disable it, change severity, scope, wording or fix guidance.",
      inputSchema: z.object({
        ruleId: z.string(),
        enabled: looseBoolean.optional(),
        severity: severitySchema.optional(),
        appliesTo: z.array(z.string()).optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        fix: z.string().optional()
      }),
      execute: async ({ ruleId, ...changes }) =>
        safely(() => agent.updateRule(ruleId, changes))
    }),

    removeRule: tool({
      description: "Delete a rule from the codex (and its exceptions).",
      inputSchema: z.object({ ruleId: z.string() }),
      execute: async ({ ruleId }) =>
        safely(() => ({ removed: agent.removeRule(ruleId) }))
    }),

    addException: tool({
      description:
        "Add an exception that waives a rule for matching files, e.g. allow console.log in scripts/**. Use ruleId '*' to waive all rules.",
      inputSchema: z.object({
        ruleId: z.string().describe("Rule id, or '*' for every rule"),
        pathGlob: z
          .string()
          .describe("File glob, e.g. 'scripts/**' or '*.test.ts'"),
        reason: z.string().describe("Why the exception is acceptable")
      }),
      execute: async (input) => safely(() => agent.addException(input))
    }),

    removeException: tool({
      description: "Delete an exception by id.",
      inputSchema: z.object({ exceptionId: z.string() }),
      execute: async ({ exceptionId }) =>
        safely(() => ({ removed: agent.removeException(exceptionId) }))
    }),

    reviewPullRequest: tool({
      description:
        "Start a review of a GitHub pull request against the codex. It runs in the background and the user sees live progress and results in the chat, so don't check on it afterwards.",
      inputSchema: z.object({
        pullRequest: z
          .string()
          .describe(
            "PR URL like https://github.com/owner/repo/pull/12, or owner/repo#12"
          ),
        postComment: looseBoolean
          .optional()
          .describe(
            "Omit unless the user explicitly asks to post or comment on GitHub"
          )
      }),
      execute: async ({ pullRequest, postComment }) =>
        safely(() => agent.startReview(pullRequest, postComment === true))
    }),

    getReview: tool({
      description:
        "Get the findings of a finished review as a markdown report, to explain them when the user asks. Omit reviewId for the most recent review.",
      inputSchema: z.object({ reviewId: z.string().optional() }),
      execute: async ({ reviewId }) =>
        safely(() => agent.reviewReport(reviewId))
    })
  };
}
