/** Runtime configuration read from the Worker environment. */

/** GITHUB_TOKEN is an optional secret, so it isn't part of the generated Env type. */
export function githubToken(env: Env): string | undefined {
  const token = (env as Env & { GITHUB_TOKEN?: string }).GITHUB_TOKEN;
  return token?.trim() || undefined;
}

/** Name of the Workflow binding in wrangler.jsonc. */
export const REVIEW_WORKFLOW = "REVIEW_WORKFLOW";

/** Event the review workflow waits on before posting a PR comment. */
export const COMMENT_DECISION_EVENT = "comment-decision";
