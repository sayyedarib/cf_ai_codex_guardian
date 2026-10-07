/** Types used across the pure review pipeline. */

export interface AddedLine {
  /** 1-based line number in the new version of the file. */
  line: number;
  content: string;
}

/** A changed file reduced to what we review: the lines the PR adds. */
export interface FileChange {
  path: string;
  addedLines: AddedLine[];
}

/** A single LLM chat message, provider-agnostic. */
export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

/**
 * Sends messages to an LLM and returns its raw text reply.
 * Injected so review logic never depends on a specific provider.
 */
export type CompleteFn = (messages: LlmMessage[]) => Promise<string>;
