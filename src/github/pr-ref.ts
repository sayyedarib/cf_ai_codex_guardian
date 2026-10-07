import type { PullRequestRef } from "../shared/schemas";

const URL_FORM =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i;
const SHORT_FORM = /^([\w.-]+)\/([\w.-]+)#(\d+)$/;

/**
 * Parses `https://github.com/owner/repo/pull/12` or `owner/repo#12`.
 * Returns null for anything else.
 */
export function parsePullRequestRef(input: string): PullRequestRef | null {
  const text = input.trim();
  const match = URL_FORM.exec(text) ?? SHORT_FORM.exec(text);
  if (!match) return null;
  const number = Number(match[3]);
  if (!Number.isSafeInteger(number) || number <= 0) return null;
  return { owner: match[1], repo: match[2], number };
}
