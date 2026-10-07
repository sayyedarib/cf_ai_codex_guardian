/**
 * Workaround for workers-ai-provider 4.0.0: Workers AI stream chunks for
 * Llama 3.3 carry the same data twice, in the native fields (`response`,
 * `tool_calls`) and in OpenAI-style `choices[0].delta`. The provider emits
 * both, so every token and tool call shows up twice. When `choices` is
 * present we drop the native duplicates.
 * Remove this file once the provider handles it.
 */

/** Rewrites one SSE line. Lines that aren't JSON data events pass through unchanged. */
export function dedupeSseLine(line: string): string {
  if (!line.startsWith("data:")) return line;
  const payload = line.slice(5).trim();
  if (!payload.startsWith("{")) return line; // e.g. "data: [DONE]"
  try {
    const chunk = JSON.parse(payload) as Record<string, unknown>;
    const hasDuplicates = "response" in chunk || "tool_calls" in chunk;
    if (!Array.isArray(chunk.choices) || !hasDuplicates) return line;
    delete chunk.response;
    delete chunk.tool_calls;
    return `data: ${JSON.stringify(chunk)}`;
  } catch {
    return line;
  }
}

/** Applies `dedupeSseLine` to a byte stream of server-sent events. */
export function dedupeSseStream(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return new TransformStream({
    transform(bytes, controller) {
      buffer += decoder.decode(bytes, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${dedupeSseLine(line)}\n`));
      }
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer) controller.enqueue(encoder.encode(dedupeSseLine(buffer)));
    }
  });
}

/** Wraps an AI binding so streamed responses go through `dedupeSseStream`. */
export function withDedupedStreams(ai: Ai): Ai {
  return new Proxy(ai, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop !== "run" || typeof value !== "function") {
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async (...args: unknown[]) => {
        const result: unknown = await value.apply(target, args);
        return result instanceof ReadableStream
          ? result.pipeThrough(dedupeSseStream())
          : result;
      };
    }
  });
}
