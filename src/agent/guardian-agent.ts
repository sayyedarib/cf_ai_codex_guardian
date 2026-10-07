/**
 * One GuardianAgent (Durable Object) per team codex. It owns the chat, the
 * codex in SQLite, and coordinates review workflows. State pushed to the UI
 * is a projection of SQLite, refreshed after every change.
 */
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { callable, type Connection } from "agents";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { COMMENT_DECISION_EVENT, REVIEW_WORKFLOW } from "../config";
import { parsePullRequestRef } from "../github/pr-ref";
import { withDedupedStreams } from "../llm/dedupe-stream";
import { MODEL } from "../llm/workers-ai";
import {
  formatPrComment,
  formatReviewMarkdown,
  prLabel
} from "../review/report";
import {
  applyOutcome,
  applyStepProgress,
  completeReview,
  createReviewRecord,
  failReview,
  setCommentStatus,
  type ReviewOutcome
} from "../review/review-record";
import { randomId } from "../shared/ids";
import {
  stepProgressSchema,
  type CodexState,
  type CommentStatus,
  type NewException,
  type NewRule,
  type ReviewRecord,
  type RulePatch
} from "../shared/schemas";
import { CodexStore } from "../storage/codex-store";
import type { ReviewParams } from "../workflow/review-workflow";
import { SYSTEM_PROMPT } from "./system-prompt";
import { createGuardianTools } from "./tools";

/** How many recent reviews are synced to the UI. */
const SYNCED_REVIEWS = 10;

export class GuardianAgent extends AIChatAgent<Env, CodexState> {
  initialState: CodexState = { rules: [], exceptions: [], reviews: [] };
  maxPersistedMessages = 100;

  private _store?: CodexStore;

  private get store(): CodexStore {
    return (this._store ??= new CodexStore(this.ctx.storage.sql));
  }

  onStart() {
    this.syncState();
  }

  /** Clients read state but may only change it through callable methods. */
  validateStateChange(_next: CodexState, source: Connection | "server") {
    if (source !== "server") {
      throw new Error("State is read-only for clients");
    }
  }

  // ── Chat ────────────────────────────────────────────────────────────

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const workersai = createWorkersAI({
      binding: withDedupedStreams(this.env.AI)
    });
    const result = streamText({
      model: workersai(MODEL),
      system: SYSTEM_PROMPT,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages"
      }),
      tools: createGuardianTools(this),
      // Workers AI defaults to 256 output tokens, which cuts answers short.
      maxOutputTokens: 1500,
      stopWhen: stepCountIs(8),
      abortSignal: options?.abortSignal
    });
    return result.toUIMessageStreamResponse();
  }

  // ── Codex (used by chat tools and the UI) ───────────────────────────

  codexOverview() {
    return {
      rules: this.store.listRules(),
      exceptions: this.store.listExceptions()
    };
  }

  addRule(input: NewRule) {
    return this.mutate(() => this.store.addRule(input));
  }

  @callable()
  updateRule(ruleId: string, patch: RulePatch) {
    return this.mutate(() => this.store.updateRule(ruleId, patch));
  }

  @callable()
  removeRule(ruleId: string) {
    return this.mutate(() => this.store.removeRule(ruleId));
  }

  addException(input: NewException) {
    return this.mutate(() => this.store.addException(input));
  }

  @callable()
  removeException(exceptionId: string) {
    return this.mutate(() => this.store.removeException(exceptionId));
  }

  // ── Reviews ─────────────────────────────────────────────────────────

  async startReview(pullRequest: string, postComment: boolean) {
    const pr = parsePullRequestRef(pullRequest);
    if (!pr) {
      throw new Error(
        "Not a pull request reference. Use https://github.com/owner/repo/pull/12 or owner/repo#12."
      );
    }
    const reviewId = randomId("rev");
    this.saveReview(createReviewRecord(reviewId, pr, postComment, new Date()));

    const params: ReviewParams = { reviewId, pr, postComment };
    await this.runWorkflow(REVIEW_WORKFLOW, params, { id: reviewId });
    return {
      reviewId,
      pullRequest: prLabel(pr),
      status: "started",
      note: "Progress and findings appear live in the review card."
    };
  }

  reviewReport(reviewId?: string) {
    const review = reviewId
      ? this.store.getReview(reviewId)
      : this.store.listReviews(1)[0];
    if (!review) throw new Error("No review found.");
    if (review.status === "running") {
      return {
        reviewId: review.id,
        status: "running",
        note: "Still running. Tell the user to watch the live review card; don't check again until they ask."
      };
    }
    return {
      reviewId: review.id,
      status: review.status,
      error: review.error,
      report: formatReviewMarkdown(review)
    };
  }

  /** Approve or reject posting the summary comment (buttons in the review card). */
  @callable()
  async decideComment(reviewId: string, approved: boolean) {
    const review = this.requireReview(reviewId);
    if (review.comment.status !== "awaiting_approval") {
      throw new Error("This review isn't waiting for a comment decision.");
    }
    await this.sendWorkflowEvent(REVIEW_WORKFLOW, reviewId, {
      type: COMMENT_DECISION_EVENT,
      payload: { approved }
    });
  }

  // ── Called by ReviewWorkflow over RPC ───────────────────────────────

  getCodexSnapshot() {
    return {
      rules: this.store.listRules().filter((r) => r.enabled),
      exceptions: this.store.listExceptions()
    };
  }

  recordOutcome(reviewId: string, outcome: ReviewOutcome) {
    this.updateReview(reviewId, (r) => applyOutcome(r, outcome));
  }

  setCommentStatus(
    reviewId: string,
    status: CommentStatus,
    details?: { url?: string; detail?: string }
  ) {
    this.updateReview(reviewId, (r) => setCommentStatus(r, status, details));
  }

  getCommentBody(reviewId: string): string {
    return formatPrComment(this.requireReview(reviewId));
  }

  // ── Workflow lifecycle callbacks ────────────────────────────────────

  async onWorkflowProgress(_name: string, reviewId: string, progress: unknown) {
    const parsed = stepProgressSchema.safeParse(progress);
    if (parsed.success) {
      this.updateReview(reviewId, (r) => applyStepProgress(r, parsed.data));
    }
  }

  async onWorkflowComplete(_name: string, reviewId: string) {
    this.updateReview(reviewId, (r) => completeReview(r, new Date()));
  }

  async onWorkflowError(_name: string, reviewId: string, error: string) {
    this.updateReview(reviewId, (r) => failReview(r, error, new Date()));
  }

  // ── Internals ───────────────────────────────────────────────────────

  private requireReview(reviewId: string): ReviewRecord {
    const review = this.store.getReview(reviewId);
    if (!review) throw new Error(`Unknown review "${reviewId}"`);
    return review;
  }

  private updateReview(
    reviewId: string,
    change: (review: ReviewRecord) => ReviewRecord
  ) {
    const review = this.store.getReview(reviewId);
    if (review) this.saveReview(change(review));
  }

  private saveReview(review: ReviewRecord) {
    this.mutate(() => this.store.saveReview(review));
  }

  /** Runs a store change, then pushes the fresh projection to every client. */
  private mutate<T>(change: () => T): T {
    const result = change();
    this.syncState();
    return result;
  }

  private syncState() {
    this.setState({
      rules: this.store.listRules(),
      exceptions: this.store.listExceptions(),
      reviews: this.store.listReviews(SYNCED_REVIEWS)
    });
  }
}
