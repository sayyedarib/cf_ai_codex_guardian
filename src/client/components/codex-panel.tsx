import { useState } from "react";
import { Badge, Button, Switch, Text } from "@cloudflare/kumo";
import { TrashIcon } from "@phosphor-icons/react";
import { prLabel, summaryLine } from "../../review/report";
import type { ReviewRecord, Rule } from "../../shared/schemas";
import { useCodex } from "../codex-context";
import { ReviewCard } from "./review-card";

function Section({
  title,
  count,
  children
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Text size="sm" bold>
          {title}
        </Text>
        <Badge variant="secondary">{count}</Badge>
      </div>
      {children}
    </section>
  );
}

function RuleRow({ rule }: { rule: Rule }) {
  const { actions } = useCodex();
  return (
    <li className="rounded-lg border border-kumo-line p-2.5 space-y-1">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-kumo-default">
              {rule.title}
            </span>
            <Badge
              variant={rule.severity === "error" ? "destructive" : "secondary"}
            >
              {rule.severity}
            </Badge>
            <span className="text-[10px] uppercase text-kumo-subtle">
              {rule.kind}
            </span>
          </div>
          <code className="text-[11px] text-kumo-subtle">{rule.id}</code>
        </div>
        <Switch
          size="sm"
          checked={rule.enabled}
          aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.title}`}
          onCheckedChange={(enabled) =>
            actions.setRuleEnabled(rule.id, enabled)
          }
        />
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          aria-label={`Delete ${rule.title}`}
          icon={<TrashIcon size={12} />}
          onClick={() => actions.removeRule(rule.id)}
        />
      </div>
      <Text size="xs" variant="secondary">
        {rule.description}
      </Text>
      {rule.pattern && (
        <code className="block text-[11px] font-mono text-kumo-subtle break-all">
          /{rule.pattern}/{rule.flags ?? ""}
        </code>
      )}
      <Text size="xs" variant="secondary">
        Applies to: {rule.appliesTo.join(", ")}
      </Text>
    </li>
  );
}

function ReviewRow({ review }: { review: ReviewRecord }) {
  const [open, setOpen] = useState(false);
  const status =
    review.status === "completed"
      ? summaryLine(review.findings)
      : review.status.replace("_", " ");
  return (
    <li className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left rounded-lg border border-kumo-line p-2.5 hover:bg-kumo-control"
      >
        <div className="text-sm font-medium text-kumo-default">
          {prLabel(review.pr)}
        </div>
        <div className="text-xs text-kumo-subtle">
          {status} · {new Date(review.createdAt).toLocaleString()}
        </div>
      </button>
      {open && <ReviewCard reviewId={review.id} />}
    </li>
  );
}

/** Side panel: the live codex (rules, exceptions) and review history. */
export function CodexPanel() {
  const { state, actions } = useCodex();
  const rulesById = new Map(state.rules.map((r) => [r.id, r.title]));

  return (
    <div className="space-y-6">
      <Section title="Rules" count={state.rules.length}>
        {state.rules.length === 0 ? (
          <Text size="xs" variant="secondary">
            No rules yet. Ask in chat, e.g. "Add a rule: no TODO comments".
          </Text>
        ) : (
          <ul className="space-y-2">
            {state.rules.map((rule) => (
              <RuleRow key={rule.id} rule={rule} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Exceptions" count={state.exceptions.length}>
        {state.exceptions.length === 0 ? (
          <Text size="xs" variant="secondary">
            None. Ask in chat, e.g. "Allow console.log in scripts/**".
          </Text>
        ) : (
          <ul className="space-y-2">
            {state.exceptions.map((ex) => (
              <li
                key={ex.id}
                className="flex items-start gap-2 rounded-lg border border-kumo-line p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-kumo-default">
                    {ex.ruleId === "*"
                      ? "All rules"
                      : (rulesById.get(ex.ruleId) ?? ex.ruleId)}{" "}
                    in <code className="font-mono text-xs">{ex.pathGlob}</code>
                  </div>
                  <Text size="xs" variant="secondary">
                    {ex.reason}
                  </Text>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  shape="square"
                  aria-label="Delete exception"
                  icon={<TrashIcon size={12} />}
                  onClick={() => actions.removeException(ex.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recent reviews" count={state.reviews.length}>
        {state.reviews.length === 0 ? (
          <Text size="xs" variant="secondary">
            No reviews yet.
          </Text>
        ) : (
          <ul className="space-y-2">
            {state.reviews.map((review) => (
              <ReviewRow key={review.id} review={review} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
