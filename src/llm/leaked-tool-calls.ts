/**
 * Llama 3.3 sometimes writes a tool call as plain text, e.g.
 * `{"name": "reviewPullRequest", "parameters": {...}}`, instead of a
 * structured call, especially in longer chats. This middleware holds back
 * text that could be such a call and, if it parses as a call to a known
 * tool, emits a real tool call instead. Anything else streams through.
 */
import type {
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart
} from "@ai-sdk/provider";
import type { LanguageModelMiddleware } from "ai";

export interface LeakedToolCall {
  toolName: string;
  /** JSON-encoded arguments. */
  input: string;
}

/** Could `text` (so far) still turn out to be a leaked tool call? */
export function mightBeToolCall(text: string): boolean {
  const start = text.trimStart();
  return start === "" || /^[{[`]/.test(start);
}

/**
 * Parses `{"name": ..., "parameters"|"arguments": {...}}` (or an array of
 * them, optionally in a code fence). Returns [] unless every item is a call
 * to a known tool.
 */
export function parseLeakedToolCalls(
  text: string,
  toolNames: ReadonlySet<string>
): LeakedToolCall[] {
  const body = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  if (!/^[{[]/.test(body)) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }

  const calls: LeakedToolCall[] = [];
  for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
    if (!item || typeof item !== "object") return [];
    const {
      name,
      parameters,
      arguments: args
    } = item as Record<string, unknown>;
    const input = parameters ?? args ?? {};
    if (typeof name !== "string" || !toolNames.has(name)) return [];
    if (!input || typeof input !== "object") return [];
    calls.push({ toolName: name, input: JSON.stringify(input) });
  }
  return calls;
}

type Part = LanguageModelV4StreamPart;

export function recoverToolCallsStream(
  toolNames: ReadonlySet<string>
): TransformStream<Part, Part> {
  // Text blocks we're holding back, by id: the parts so far and their text.
  const held = new Map<string, { parts: Part[]; text: string }>();
  let recovered = false;

  const release = (
    id: string,
    controller: TransformStreamDefaultController<Part>
  ) => {
    for (const part of held.get(id)?.parts ?? []) controller.enqueue(part);
    held.delete(id);
  };

  return new TransformStream<Part, Part>({
    transform(part, controller) {
      if (part.type === "text-start") {
        held.set(part.id, { parts: [part], text: "" });
        return;
      }
      if (part.type === "text-delta" && held.has(part.id)) {
        const block = held.get(part.id)!;
        block.parts.push(part);
        block.text += part.delta;
        if (!mightBeToolCall(block.text)) release(part.id, controller);
        return;
      }
      if (part.type === "text-end" && held.has(part.id)) {
        const calls = parseLeakedToolCalls(held.get(part.id)!.text, toolNames);
        if (calls.length === 0) {
          release(part.id, controller);
          controller.enqueue(part);
          return;
        }
        held.delete(part.id);
        recovered = true;
        for (const call of calls) {
          const id = `recovered-${crypto.randomUUID()}`;
          controller.enqueue({
            type: "tool-input-start",
            id,
            toolName: call.toolName
          });
          controller.enqueue({
            type: "tool-input-delta",
            id,
            delta: call.input
          });
          controller.enqueue({ type: "tool-input-end", id });
          controller.enqueue({
            type: "tool-call",
            toolCallId: id,
            toolName: call.toolName,
            input: call.input
          });
        }
        return;
      }
      if (part.type === "finish" && recovered) {
        const finishReason: LanguageModelV4FinishReason = {
          unified: "tool-calls",
          raw: part.finishReason.raw
        };
        controller.enqueue({ ...part, finishReason });
        return;
      }
      controller.enqueue(part);
    },
    flush(controller) {
      for (const id of [...held.keys()]) release(id, controller);
    }
  });
}

export const recoverLeakedToolCalls: LanguageModelMiddleware = {
  wrapStream: async ({ doStream, params }) => {
    const result = await doStream();
    const toolNames = new Set(
      (params.tools ?? []).flatMap((t) =>
        t.type === "function" ? [t.name] : []
      )
    );
    if (toolNames.size === 0) return result;
    return {
      ...result,
      stream: result.stream.pipeThrough(recoverToolCallsStream(toolNames))
    };
  }
};
