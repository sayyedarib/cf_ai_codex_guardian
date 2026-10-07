/**
 * Domain schemas shared by the Worker and the UI.
 * zod is the single source of truth: every type below is inferred from a schema.
 */
import { z } from "zod";

export const severitySchema = z.enum(["error", "warning", "info"]);
export type Severity = z.infer<typeof severitySchema>;

export const ruleKindSchema = z.enum(["regex", "llm"]);
export type RuleKind = z.infer<typeof ruleKindSchema>;

/** Regex flags we allow. `g` and `y` are excluded because they make `test()` stateful. */
const regexFlagsSchema = z
  .string()
  .regex(/^[imsu]*$/, "Only the i, m, s and u flags are allowed");

export function isValidRegex(pattern: string, flags = ""): boolean {
  try {
    new RegExp(pattern, flags);
    return true;
  } catch {
    return false;
  }
}

export const ruleSchema = z.object({
  id: z.string(),
  title: z.string().min(3).max(120),
  description: z.string().min(3).max(1000),
  kind: ruleKindSchema,
  /** Regex rules only: matched against each added line. */
  pattern: z.string().optional(),
  flags: regexFlagsSchema.optional(),
  /** Glob patterns of files the rule applies to, e.g. `src/**\/*.ts`. */
  appliesTo: z.array(z.string()).min(1),
  severity: severitySchema,
  /** Guidance on how to fix a violation. */
  fix: z.string().max(500).optional(),
  enabled: z.boolean(),
  createdAt: z.string()
});
export type Rule = z.infer<typeof ruleSchema>;

/** Input accepted when creating a rule (from chat or MCP). */
export const newRuleSchema = ruleSchema
  .omit({ id: true, enabled: true, createdAt: true })
  .extend({
    appliesTo: z.array(z.string()).min(1).default(["**/*"])
  })
  .refine((r) => r.kind !== "regex" || !!r.pattern, {
    message: "Regex rules need a pattern",
    path: ["pattern"]
  })
  .refine((r) => !r.pattern || isValidRegex(r.pattern, r.flags), {
    message: "Pattern is not a valid regular expression",
    path: ["pattern"]
  });
export type NewRule = z.input<typeof newRuleSchema>;

export const rulePatchSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  description: z.string().min(3).max(1000).optional(),
  appliesTo: z.array(z.string()).min(1).optional(),
  severity: severitySchema.optional(),
  fix: z.string().max(500).optional(),
  enabled: z.boolean().optional()
});
export type RulePatch = z.infer<typeof rulePatchSchema>;

/** Wildcard rule id: the exception applies to every rule. */
export const ANY_RULE = "*";

export const codexExceptionSchema = z.object({
  id: z.string(),
  /** A rule id, or `*` for all rules. */
  ruleId: z.string(),
  /** Glob of files the exception covers. */
  pathGlob: z.string().min(1),
  reason: z.string().min(3).max(500),
  createdAt: z.string()
});
export type CodexException = z.infer<typeof codexExceptionSchema>;

export const newExceptionSchema = codexExceptionSchema.omit({
  id: true,
  createdAt: true
});
export type NewException = z.infer<typeof newExceptionSchema>;

export const pullRequestRefSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  number: z.number().int().positive()
});
export type PullRequestRef = z.infer<typeof pullRequestRefSchema>;

export const findingSchema = z.object({
  ruleId: z.string(),
  ruleTitle: z.string(),
  severity: severitySchema,
  file: z.string(),
  line: z.number().int().positive(),
  message: z.string(),
  suggestion: z.string().optional(),
  snippet: z.string(),
  source: ruleKindSchema
});
export type Finding = z.infer<typeof findingSchema>;

/** Steps of the review workflow, in order. The UI renders them as a tracker. */
export const REVIEW_STEPS = [
  { id: "fetch_pr", label: "Fetch PR files" },
  { id: "snapshot_codex", label: "Snapshot rules & exceptions" },
  { id: "regex_rules", label: "Run regex rules" },
  { id: "llm_rules", label: "Run LLM rules" },
  { id: "apply_exceptions", label: "Apply exceptions" },
  { id: "save_review", label: "Save review" },
  { id: "post_comment", label: "Post PR comment" }
] as const;

export const reviewStepIdSchema = z.enum(
  REVIEW_STEPS.map((s) => s.id) as [
    (typeof REVIEW_STEPS)[number]["id"],
    ...(typeof REVIEW_STEPS)[number]["id"][]
  ]
);
export type ReviewStepId = z.infer<typeof reviewStepIdSchema>;

export const stepStatusSchema = z.enum([
  "pending",
  "running",
  "done",
  "skipped",
  "failed",
  "waiting"
]);
export type StepStatus = z.infer<typeof stepStatusSchema>;

export const stepProgressSchema = z.object({
  id: reviewStepIdSchema,
  status: stepStatusSchema,
  detail: z.string().optional()
});
export type StepProgress = z.infer<typeof stepProgressSchema>;

export const commentStatusSchema = z.enum([
  "not_requested",
  "awaiting_approval",
  "posted",
  "rejected",
  "skipped"
]);
export type CommentStatus = z.infer<typeof commentStatusSchema>;

export const reviewStatusSchema = z.enum([
  "running",
  "awaiting_approval",
  "completed",
  "failed"
]);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const reviewRecordSchema = z.object({
  id: z.string(),
  pr: pullRequestRefSchema,
  title: z.string().optional(),
  headSha: z.string().optional(),
  status: reviewStatusSchema,
  steps: z.array(stepProgressSchema),
  findings: z.array(findingSchema),
  suppressedCount: z.number().int().nonnegative(),
  filesReviewed: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
  comment: z.object({
    status: commentStatusSchema,
    url: z.string().optional(),
    detail: z.string().optional()
  }),
  error: z.string().optional(),
  createdAt: z.string(),
  completedAt: z.string().optional()
});
export type ReviewRecord = z.infer<typeof reviewRecordSchema>;

/** State synced live from the agent to every connected UI. */
export type CodexState = {
  rules: Rule[];
  exceptions: CodexException[];
  reviews: ReviewRecord[];
};
