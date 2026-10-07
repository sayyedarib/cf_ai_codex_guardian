import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { Badge, Surface, Text } from "@cloudflare/kumo";
import { GearIcon, XCircleIcon } from "@phosphor-icons/react";
import { ReviewCard } from "./review-card";

type Part = UIMessage["parts"][number];

const TOOL_LABELS: Record<string, string> = {
  listCodex: "Read the codex",
  addRegexRule: "Added a regex rule",
  addLlmRule: "Added an LLM rule",
  updateRule: "Updated a rule",
  removeRule: "Removed a rule",
  addException: "Added an exception",
  removeException: "Removed an exception",
  reviewPullRequest: "Started a review",
  getReview: "Read review results"
};

function reviewIdOf(output: unknown): string | undefined {
  if (output && typeof output === "object" && "reviewId" in output) {
    const id = (output as { reviewId: unknown }).reviewId;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function errorOf(output: unknown): string | undefined {
  if (output && typeof output === "object" && "error" in output) {
    return String((output as { error: unknown }).error);
  }
  return undefined;
}

function Row({
  children,
  danger
}: {
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="flex justify-start">
      <Surface
        className={`max-w-[85%] px-3 py-2 rounded-xl ring ${danger ? "ring-kumo-danger" : "ring-kumo-line"}`}
      >
        <div className="flex items-center gap-2">{children}</div>
      </Surface>
    </div>
  );
}

/** Compact view of a tool call. A started review renders as a live ReviewCard. */
export function ToolPart({
  part,
  showDebug
}: {
  part: Part;
  showDebug: boolean;
}) {
  if (!isToolUIPart(part)) return null;
  const name = getToolName(part);
  const label = TOOL_LABELS[name] ?? name;

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <Row>
        <GearIcon size={14} className="text-kumo-inactive animate-spin" />
        <Text size="xs" variant="secondary">
          {label}…
        </Text>
      </Row>
    );
  }

  if (part.state === "output-error") {
    return (
      <Row danger>
        <XCircleIcon size={14} className="text-kumo-danger" />
        <Text size="xs" variant="secondary">
          {label}: {part.errorText || "failed"}
        </Text>
      </Row>
    );
  }

  if (part.state !== "output-available") return null;

  const error = errorOf(part.output);
  const reviewId =
    name === "reviewPullRequest" ? reviewIdOf(part.output) : undefined;
  if (reviewId && !error) return <ReviewCard reviewId={reviewId} />;

  return (
    <div className="space-y-1">
      <Row danger={!!error}>
        <GearIcon size={14} className="text-kumo-inactive" />
        <Text size="xs" variant="secondary" bold>
          {label}
        </Text>
        <Badge variant={error ? "destructive" : "secondary"}>
          {error ? "Error" : "Done"}
        </Badge>
      </Row>
      {(error || showDebug) && (
        <pre className="ml-1 max-w-[85%] text-xs font-mono text-kumo-subtle whitespace-pre-wrap overflow-auto max-h-64">
          {error ??
            JSON.stringify({ input: part.input, output: part.output }, null, 2)}
        </pre>
      )}
    </div>
  );
}
