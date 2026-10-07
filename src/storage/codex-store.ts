/**
 * Persistence for one team's codex: rules, exceptions and review history,
 * stored in the agent's own SQLite database.
 */
import {
  codexExceptionSchema,
  newExceptionSchema,
  newRuleSchema,
  reviewRecordSchema,
  rulePatchSchema,
  ruleSchema,
  type CodexException,
  type NewException,
  type NewRule,
  type ReviewRecord,
  type Rule,
  type RulePatch
} from "../shared/schemas";
import { randomId, uniqueSlug } from "../shared/ids";
import { DEFAULT_RULES } from "./default-rules";
import { JsonTable } from "./json-table";

export class CodexStore {
  private readonly rules: JsonTable<Rule>;
  private readonly exceptions: JsonTable<CodexException>;
  private readonly reviews: JsonTable<ReviewRecord>;

  constructor(private readonly sql: SqlStorage) {
    this.rules = new JsonTable(sql, "codex_rules", ruleSchema);
    this.exceptions = new JsonTable(
      sql,
      "codex_exceptions",
      codexExceptionSchema
    );
    this.reviews = new JsonTable(sql, "codex_reviews", reviewRecordSchema);
    sql.exec(
      "CREATE TABLE IF NOT EXISTS codex_meta (key TEXT PRIMARY KEY, value TEXT)"
    );
    this.seedOnce();
  }

  // ── Rules ───────────────────────────────────────────────────────────

  listRules(): Rule[] {
    // Oldest first reads naturally in a list of rules.
    return this.rules.list().reverse();
  }

  getRule(id: string): Rule | undefined {
    return this.rules.get(id);
  }

  addRule(input: NewRule, now = new Date()): Rule {
    const parsed = newRuleSchema.parse(input);
    const existing = this.listRules();
    const duplicate = existing.find(
      (r) => r.title.toLowerCase() === parsed.title.toLowerCase()
    );
    if (duplicate) {
      throw new Error(
        `A rule titled "${duplicate.title}" already exists (id: ${duplicate.id}).`
      );
    }
    const taken = new Set(existing.map((r) => r.id));
    const rule: Rule = {
      ...parsed,
      id: uniqueSlug(parsed.title, taken),
      enabled: true,
      createdAt: now.toISOString()
    };
    this.rules.put(rule, rule.createdAt);
    return rule;
  }

  updateRule(id: string, patch: RulePatch): Rule {
    const rule = this.requireRule(id);
    const updated = ruleSchema.parse({
      ...rule,
      ...rulePatchSchema.parse(patch)
    });
    this.rules.put(updated, updated.createdAt);
    return updated;
  }

  /** Removes a rule and the exceptions that only made sense for it. */
  removeRule(id: string): boolean {
    for (const ex of this.listExceptions()) {
      if (ex.ruleId === id) this.exceptions.delete(ex.id);
    }
    return this.rules.delete(id);
  }

  // ── Exceptions ──────────────────────────────────────────────────────

  listExceptions(): CodexException[] {
    return this.exceptions.list().reverse();
  }

  addException(input: NewException, now = new Date()): CodexException {
    const parsed = newExceptionSchema.parse(input);
    if (parsed.ruleId !== "*") this.requireRule(parsed.ruleId);
    // Idempotent: the chat model sometimes repeats a call it already made.
    const existing = this.listExceptions().find(
      (ex) => ex.ruleId === parsed.ruleId && ex.pathGlob === parsed.pathGlob
    );
    if (existing) return existing;
    const exception: CodexException = {
      ...parsed,
      id: randomId("ex"),
      createdAt: now.toISOString()
    };
    this.exceptions.put(exception, exception.createdAt);
    return exception;
  }

  removeException(id: string): boolean {
    return this.exceptions.delete(id);
  }

  // ── Reviews ─────────────────────────────────────────────────────────

  listReviews(limit: number): ReviewRecord[] {
    return this.reviews.list(limit);
  }

  getReview(id: string): ReviewRecord | undefined {
    return this.reviews.get(id);
  }

  saveReview(review: ReviewRecord): void {
    this.reviews.put(review, review.createdAt);
  }

  // ── Internals ───────────────────────────────────────────────────────

  private requireRule(id: string): Rule {
    const rule = this.rules.get(id);
    if (!rule) {
      // Listing valid ids lets the chat model correct itself on the next step.
      const ids = this.listRules().map((r) => r.id);
      throw new Error(
        `Unknown rule "${id}". Valid rule ids: ${ids.join(", ")}`
      );
    }
    return rule;
  }

  /** Seeds the starter rules once; deleting them later doesn't bring them back. */
  private seedOnce(): void {
    const seeded = this.sql
      .exec("SELECT 1 FROM codex_meta WHERE key = 'seeded'")
      .toArray().length;
    if (seeded) return;
    // Spread timestamps so the starter rules keep their order.
    const start = Date.now();
    DEFAULT_RULES.forEach((rule, i) => this.addRule(rule, new Date(start + i)));
    this.sql.exec(
      "INSERT INTO codex_meta (key, value) VALUES ('seeded', ?)",
      new Date(start).toISOString()
    );
  }
}
