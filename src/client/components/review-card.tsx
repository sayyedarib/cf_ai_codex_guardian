import { useState } from "react";
import { Badge, Button, Surface, Text } from "@cloudflare/kumo";
import {
  CheckCircleIcon,
  CircleIcon,
  CircleNotchIcon,
  HourglassIcon,
  MinusCircleIcon,
  XCircleIcon
} from "@phosphor-icons/react";
import { prLabel, prUrl, summaryLine } from "../../review/report";
import {
  REVIEW_STEPS,
  type Finding,
  type ReviewRecord,
  type Severity,
  type StepStatus
} from "../../shared/schemas";
import { useCodex } from "../codex-context";

const STEP_ICON: Record<StepStatus, React.ReactNode> = {
  pending: <CircleIcon size={14} className="text-kumo-inactive" />,
  running: (
    <CircleNotchIcon size={14} className="text-kumo-brand animate-spin" />
  ),
  done: (
    <CheckCircleIcon size={14} weight="fill" className="text-kumo-success" />
  ),
  skipped: <MinusCircleIcon size={14} className="text-kumo-inactive" />,
  failed: <XCircleIcon size={14} weight="fill" className="text-kumo-danger" />,
  waiting: <HourglassIcon size={14} className="text-kumo-warning" />
};

const SEVERITY_CLASS: Record<Severity, string> = {
  error: "text-kumo-danger",
  warning: "text-kumo-warning",
  info: "text-kumo-brand"
};

function StatusBadge({ review }: { review: ReviewRecord }) {
  switch (review.status) {
    case "completed":
      return <Badge variant="primary">Completed</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "awaiting_approval":
      return <Badge variant="secondary">Awaiting approval</Badge>;
    default:
      return <Badge variant="secondary">Running</Badge>;
  }
}

function StepTracker({ review }: { review: ReviewRecord }) {
  return (
    <ol className="grid gap-1 sm:grid-cols-2">
      {REVIEW_STEPS.map(({ id, label }) => {
        const step = review.steps.find((s) => s.id === id);
        const status = step?.status ?? "pending";
        return (
          <li key={id} className="flex items-center gap-2 min-w-0">
            {STEP_ICON[status]}
            <Text
              size="xs"
              variant={status === "pending" ? "secondary" : undefined}
            >
              {label}
            </Text>
            {step?.detail && (
              <span className="text-xs text-kumo-subtle truncate">
                · {step.detail}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function FindingItem({ finding }: { finding: Finding }) {
  return (
    <li className="rounded-lg border border-kumo-line p-2.5 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-xs font-semibold uppercase ${SEVERITY_CLASS[finding.severity]}`}
        >
          {finding.severity}
        </span>
        <code className="text-xs font-mono text-kumo-default break-all">
          {finding.file}:{finding.line}
        </code>
        <Badge variant="secondary">{finding.ruleTitle}</Badge>
        {finding.source === "llm" && (
          <span className="text-[10px] text-kumo-subtle">LLM</span>
        )}
      </div>
      <Text size="sm">{finding.message}</Text>
      <pre className="text-xs font-mono bg-kumo-control rounded px-2 py-1 whitespace-pre-wrap break-all">
        {finding.snippet}
      </pre>
      {finding.suggestion && (
        <Text size="xs" variant="secondary">
          <span className="font-semibold">Fix:</span> {finding.suggestion}
        </Text>
      )}
    </li>
  );
}

function CommentDecision({ review }: { review: ReviewRecord }) {
  const { actions } = useCodex();
  const [busy, setBusy] = useState(false);
  const waiting = review.steps.some(
    (s) => s.id === "post_comment" && s.status === "waiting"
  );

  if (review.comment.status === "posted" && review.comment.url) {
    return (
      <a
        className="text-xs text-kumo-link underline"
        href={review.comment.url}
        target="_blank"
        rel="noreferrer"
      >
        Summary comment posted on GitHub ↗
      </a>
    );
  }
  if (review.comment.status === "rejected") {
    return (
      <Text size="xs" variant="secondary">
        PR comment was not posted.
      </Text>
    );
  }
  if (review.comment.status === "skipped" && review.comment.detail) {
    return (
      <Text size="xs" variant="secondary">
        PR comment skipped: {review.comment.detail}
      </Text>
    );
  }
  if (!waiting) return null;

  const decide = async (approved: boolean) => {
    setBusy(true);
    try {
      await actions.decideComment(review.id, approved);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg ring-2 ring-kumo-warning p-3 space-y-2">
      <Text size="sm" bold>
        Post this summary as a comment on {prLabel(review.pr)}?
      </Text>
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={busy}
          icon={<CheckCircleIcon size={14} />}
          onClick={() => decide(true)}
        >
          Approve
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          icon={<XCircleIcon size={14} />}
          onClick={() => decide(false)}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}

/** Live view of one review: progress while running, findings when done. */
export function ReviewCard({ reviewId }: { reviewId: string }) {
  const { state } = useCodex();
  const review = state.reviews.find((r) => r.id === reviewId);

  if (!review) {
    return (
      <Surface className="px-4 py-3 rounded-xl ring ring-kumo-line">
        <Text size="xs" variant="secondary">
          Review {reviewId} is no longer in recent history.
        </Text>
      </Surface>
    );
  }

  const finished = review.status === "completed" || review.status === "failed";
  return (
    <Surface className="w-full px-4 py-3 rounded-xl ring ring-kumo-line space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={prUrl(review.pr)}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-sm text-kumo-default hover:underline"
        >
          {prLabel(review.pr)}
        </a>
        <StatusBadge review={review} />
        {review.title && (
          <span className="text-xs text-kumo-subtle truncate">
            {review.title}
          </span>
        )}
      </div>

      <StepTracker review={review} />

      {review.error && (
        <Text size="sm">
          <span className="text-kumo-danger">{review.error}</span>
        </Text>
      )}

      {review.steps.some(
        (s) => s.id === "save_review" && s.status === "done"
      ) && (
        <div className="space-y-2">
          <Text size="sm" bold>
            {summaryLine(review.findings)}
          </Text>
          {review.suppressedCount > 0 && (
            <Text size="xs" variant="secondary">
              {review.suppressedCount} finding(s) waived by exceptions.
            </Text>
          )}
          {review.findings.length > 0 && (
            <ul className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
              {review.findings.map((f) => (
                <FindingItem
                  key={`${f.ruleId}-${f.file}-${f.line}`}
                  finding={f}
                />
              ))}
            </ul>
          )}
          {finished && review.warnings.length > 0 && (
            <details>
              <summary className="text-xs text-kumo-subtle cursor-pointer">
                Review notes ({review.warnings.length})
              </summary>
              <ul className="mt-1 list-disc pl-5 text-xs text-kumo-subtle space-y-0.5">
                {review.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <CommentDecision review={review} />
    </Surface>
  );
}
