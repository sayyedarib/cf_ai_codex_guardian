import { describe, expect, it } from "vitest";
import { MAX_FINDINGS } from "../src/review/report";
import {
  applyOutcome,
  applyStepProgress,
  completeReview,
  createReviewRecord,
  failReview
} from "../src/review/review-record";
import { finding } from "./fixtures";

const pr = { owner: "acme", repo: "app", number: 1 };
const now = new Date("2026-01-01T00:00:00Z");
const outcome = {
  title: "t",
  headSha: "sha",
  filesReviewed: 1,
  findings: [],
  suppressedCount: 0,
  warnings: []
};

describe("review record", () => {
  it("starts with every step pending, and skips the comment step if not requested", () => {
    const review = createReviewRecord("rev-1", pr, false, now);
    expect(review.status).toBe("running");
    expect(review.comment.status).toBe("not_requested");
    expect(review.steps.find((s) => s.id === "post_comment")?.status).toBe(
      "skipped"
    );
    expect(review.steps.find((s) => s.id === "fetch_pr")?.status).toBe(
      "pending"
    );
  });

  it("applies step progress and flags a waiting step as awaiting approval", () => {
    let review = createReviewRecord("rev-1", pr, true, now);
    review = applyStepProgress(review, {
      id: "fetch_pr",
      status: "done",
      detail: "3 files"
    });
    expect(review.steps[0]).toEqual({
      id: "fetch_pr",
      status: "done",
      detail: "3 files"
    });
    review = applyStepProgress(review, {
      id: "post_comment",
      status: "waiting"
    });
    expect(review.status).toBe("awaiting_approval");
  });

  it("caps findings and notes it", () => {
    const many = Array.from({ length: MAX_FINDINGS + 5 }, (_, i) =>
      finding({ line: i + 1 })
    );
    const review = applyOutcome(createReviewRecord("r", pr, false, now), {
      ...outcome,
      findings: many
    });
    expect(review.findings).toHaveLength(MAX_FINDINGS);
    expect(review.warnings[0]).toMatch(/first 150 of 155/);
  });

  it("completes: leftover steps become skipped and a pending comment decision is closed", () => {
    let review = createReviewRecord("r", pr, true, now);
    review = applyStepProgress(review, {
      id: "post_comment",
      status: "waiting"
    });
    review = completeReview(review, now);
    expect(review.status).toBe("completed");
    expect(review.comment.status).toBe("skipped");
    expect(review.steps.every((s) => s.status === "skipped")).toBe(true);
  });

  it("fails: the running step is marked failed and the error kept", () => {
    let review = createReviewRecord("r", pr, false, now);
    review = applyStepProgress(review, { id: "fetch_pr", status: "running" });
    review = failReview(review, "GitHub 404", now);
    expect(review.status).toBe("failed");
    expect(review.error).toBe("GitHub 404");
    expect(review.steps[0].status).toBe("failed");
  });
});
