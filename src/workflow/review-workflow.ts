/**
 * Durable PR review. Every external call runs in its own `step.do`, so it is
 * retried on failure and never repeated once it has succeeded.
 */
import {
  AgentWorkflow,
  type AgentWorkflowEvent,
  type AgentWorkflowStep
} from "agents/workflows";
import { NonRetryableError } from "cloudflare:workflows";
import type { WorkflowStepConfig } from "cloudflare:workers";
import type { GuardianAgent } from "../agent/guardian-agent";
import { COMMENT_DECISION_EVENT, githubToken } from "../config";
import { GitHubClient, GitHubError } from "../github/client";
import { createRuleEvaluator } from "../llm/workers-ai";
import { toFileChanges } from "../review/changes";
import { applyExceptions } from "../review/exceptions";
import { evaluateBatch } from "../review/llm-rules";
import { runLlmRules } from "../review/pipeline";
import { runRegexRules } from "../review/regex-rules";
import type { ReviewOutcome } from "../review/review-record";
import type {
  PullRequestRef,
  ReviewStepId,
  StepProgress,
  StepStatus
} from "../shared/schemas";

export interface ReviewParams {
  reviewId: string;
  pr: PullRequestRef;
  postComment: boolean;
}

const GITHUB_STEP: WorkflowStepConfig = {
  retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
  timeout: "1 minute"
};
const LLM_STEP: WorkflowStepConfig = {
  retries: { limit: 2, delay: "3 seconds", backoff: "exponential" },
  timeout: "2 minutes"
};
const AGENT_STEP: WorkflowStepConfig = {
  retries: { limit: 3, delay: "1 second", backoff: "linear" }
};

/** LLM batches run this many at a time. */
const LLM_CONCURRENCY = 4;

export class ReviewWorkflow extends AgentWorkflow<
  GuardianAgent,
  ReviewParams,
  StepProgress
> {
  async run(event: AgentWorkflowEvent<ReviewParams>, step: AgentWorkflowStep) {
    const { reviewId, pr, postComment } = event.payload;
    const github = new GitHubClient(githubToken(this.env));
    const warnings: string[] = [];

    // 1. Fetch PR files and patches.
    const pull = await this.stage(
      "fetch_pr",
      () =>
        step.do("fetch-pr", GITHUB_STEP, async () => {
          try {
            return await github.getPullRequest(pr);
          } catch (err) {
            // A 404 or 401 won't fix itself; don't burn retries on it.
            if (err instanceof GitHubError && !err.retryable) {
              throw new NonRetryableError(err.message);
            }
            throw err;
          }
        }),
      (p) => `${p.files.length} files`
    );
    const { changes, skipped } = toFileChanges(pull.files);
    if (pull.truncated)
      warnings.push("PR has many files; only the first ones were reviewed.");
    if (skipped.length > 0) {
      warnings.push(`Skipped (no diff available): ${skipped.join(", ")}`);
    }

    // 2. Snapshot the codex so edits made mid-review don't change the result.
    const codex = await this.stage(
      "snapshot_codex",
      () =>
        step.do("snapshot-codex", AGENT_STEP, async () => {
          // RPC results must be disposed; copy the plain data out first.
          using snapshot = await this.agent.getCodexSnapshot();
          return {
            rules: [...snapshot.rules],
            exceptions: [...snapshot.exceptions]
          };
        }),
      (c) => `${c.rules.length} rules, ${c.exceptions.length} exceptions`
    );

    // 3. Cheap regex rules first. Pure and deterministic, so no step needed.
    const regexFindings = await this.stage(
      "regex_rules",
      async () => runRegexRules(changes, codex.rules),
      (f) => `${f.length} findings`
    );

    // 4. LLM rules in small batches. A batch that keeps failing is noted, never fatal.
    const llmFindings = await this.stage(
      "llm_rules",
      async () => {
        const complete = createRuleEvaluator(this.env.AI);
        const pass = await runLlmRules(changes, codex.rules, {
          concurrency: LLM_CONCURRENCY,
          runBatch: (batch, i) =>
            step.do(`llm-batch-${i}`, LLM_STEP, () =>
              evaluateBatch(batch, complete)
            ),
          onProgress: (done, total) =>
            this.progress("llm_rules", "running", `${done}/${total} batches`)
        });
        warnings.push(...pass.warnings);
        return pass.findings;
      },
      (f) => `${f.length} findings`
    );

    // 5. Drop findings covered by an exception.
    const { kept, suppressed } = await this.stage(
      "apply_exceptions",
      async () =>
        applyExceptions([...regexFindings, ...llmFindings], codex.exceptions),
      (r) => `${r.suppressed.length} waived`
    );

    // 6. Save the review.
    const outcome: ReviewOutcome = {
      title: pull.title,
      headSha: pull.headSha,
      filesReviewed: changes.length,
      findings: kept,
      suppressedCount: suppressed.length,
      warnings
    };
    await this.stage("save_review", () =>
      step.do("save-review", AGENT_STEP, () =>
        this.agent.recordOutcome(reviewId, outcome)
      )
    );

    // 7. Optionally post a summary comment, after a human approves it.
    if (postComment) await this.postComment(step, reviewId, pr, github);

    await step.reportComplete({ reviewId });
  }

  private async postComment(
    step: AgentWorkflowStep,
    reviewId: string,
    pr: PullRequestRef,
    github: GitHubClient
  ): Promise<void> {
    if (!github.canWrite) {
      await this.progress(
        "post_comment",
        "skipped",
        "No GITHUB_TOKEN configured"
      );
      await step.do("comment-skipped", AGENT_STEP, () =>
        this.agent.setCommentStatus(reviewId, "skipped", {
          detail: "Posting needs a GITHUB_TOKEN secret."
        })
      );
      return;
    }

    await this.progress(
      "post_comment",
      "waiting",
      "Waiting for approval in chat"
    );
    let approved = false;
    try {
      const decision = await step.waitForEvent<{ approved: boolean }>(
        "wait-for-comment-approval",
        { type: COMMENT_DECISION_EVENT, timeout: "24 hours" }
      );
      approved = decision.payload.approved === true;
    } catch {
      // Timed out: treat as not approved.
    }

    if (!approved) {
      await this.progress("post_comment", "skipped", "Not approved");
      await step.do("comment-rejected", AGENT_STEP, () =>
        this.agent.setCommentStatus(reviewId, "rejected")
      );
      return;
    }

    await this.progress("post_comment", "running");
    // Fewer retries: a retry after a lost response could post twice.
    const url = await step.do(
      "post-comment",
      { ...GITHUB_STEP, retries: { limit: 1, delay: "5 seconds" } },
      async () => {
        const body = await this.agent.getCommentBody(reviewId);
        return github.postComment(pr, body);
      }
    );
    await step.do("comment-posted", AGENT_STEP, () =>
      this.agent.setCommentStatus(reviewId, "posted", { url })
    );
    await this.progress("post_comment", "done");
  }

  /** Reports a step as running, runs it, then reports it done with a short detail. */
  private async stage<T>(
    id: ReviewStepId,
    work: () => Promise<T>,
    detail?: (result: T) => string
  ): Promise<T> {
    await this.progress(id, "running");
    const result = await work();
    await this.progress(id, "done", detail?.(result));
    return result;
  }

  /** Progress is best-effort UI feedback; it must never fail the review. */
  private async progress(
    id: ReviewStepId,
    status: StepStatus,
    detail?: string
  ) {
    try {
      await this.reportProgress({ id, status, detail });
    } catch (err) {
      console.warn("Progress report failed", err);
    }
  }
}
