/**
 * The last `max` messages, starting at a user message. Llama 3.3's tool
 * calling degrades as the context grows, and old tool outputs (full codex
 * listings, review reports) are the bulk of it.
 */
export function recentMessages<T extends { role: string }>(
  messages: readonly T[],
  max: number
): T[] {
  const window = messages.slice(-max);
  const firstUser = window.findIndex((m) => m.role === "user");
  return firstUser === -1 ? window : window.slice(firstUser);
}
