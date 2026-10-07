/**
 * Pure state transitions for a review record. The agent persists the result;
 * keeping the rules here makes them easy to test.
 */
import {
  REVIEW_STEPS,
  type CommentStatus,
  type Finding,
  type PullRequestRef,
  type ReviewRecord,
  type StepProgress
} from "../shared/schemas";
import { MAX_FINDINGS, sortAndDedupe } from "./report";

export function createReviewRecord(
  id: string,
  pr: PullRequestRef,
  postComment: boolean,
  now: Date
): ReviewRecord {
  return {
    id,
    pr,
    status: "running",
    steps: REVIEW_STEPS.map((s) => ({
      id: s.id,
      status:
        s.id === "post_comment" && !postComment
          ? ("skipped" as const)
          : ("pending" as const)
    })),
    findings: [],
    suppressedCount: 0,
    filesReviewed: 0,
    warnings: [],
    comment: { status: postComment ? "awaiting_approval" : "not_requested" },
    createdAt: now.toISOString()
  };
}

export function applyStepProgress(
  review: ReviewRecord,
  progress: StepProgress
): ReviewRecord {
  return {
    ...review,
    status: progress.status === "waiting" ? "awaiting_approval" : review.status,
    steps: review.steps.map((s) =>
      s.id === progress.id ? { ...s, ...progress } : s
    )
  };
}

/** What the workflow produces once findings are final. */
export interface ReviewOutcome {
  title: string;
  headSha: string;
  filesReviewed: number;
  findings: Finding[];
  suppressedCount: number;
  warnings: string[];
}

export function applyOutcome(
  review: ReviewRecord,
  outcome: ReviewOutcome
): ReviewRecord {
  const findings = sortAndDedupe(outcome.findings);
  const warnings = [...outcome.warnings];
  if (findings.length > MAX_FINDINGS) {
    warnings.push(
      `Showing the first ${MAX_FINDINGS} of ${findings.length} findings.`
    );
  }
  return {
    ...review,
    title: outcome.title,
    headSha: outcome.headSha,
    filesReviewed: outcome.filesReviewed,
    findings: findings.slice(0, MAX_FINDINGS),
    suppressedCount: outcome.suppressedCount,
    warnings
  };
}

export function setCommentStatus(
  review: ReviewRecord,
  status: CommentStatus,
  details: { url?: string; detail?: string } = {}
): ReviewRecord {
  return { ...review, comment: { status, ...details } };
}

export function completeReview(review: ReviewRecord, now: Date): ReviewRecord {
  return {
    ...review,
    status: "completed",
    completedAt: now.toISOString(),
    // A finished review is never "awaiting" anything.
    comment:
      review.comment.status === "awaiting_approval"
        ? { status: "skipped", detail: "Review finished without a decision." }
        : review.comment,
    steps: review.steps.map((s) =>
      s.status === "pending" || s.status === "running" || s.status === "waiting"
        ? { ...s, status: "skipped" }
        : s
    )
  };
}

export function failReview(
  review: ReviewRecord,
  error: string,
  now: Date
): ReviewRecord {
  return {
    ...review,
    status: "failed",
    error,
    completedAt: now.toISOString(),
    comment:
      review.comment.status === "awaiting_approval"
        ? { status: "skipped", detail: "Review failed." }
        : review.comment,
    steps: review.steps.map((s) =>
      s.status === "running" || s.status === "waiting"
        ? { ...s, status: "failed" }
        : s
    )
  };
}
