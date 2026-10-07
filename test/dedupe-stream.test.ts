import { describe, expect, it } from "vitest";
import { dedupeSseLine, dedupeSseStream } from "../src/llm/dedupe-stream";

const chunk = {
  choices: [{ delta: { content: "Hello" } }],
  response: "Hello",
  tool_calls: []
};

describe("dedupeSseLine", () => {
  it("drops native `response` and `tool_calls` when choices carry the data", () => {
    const out = dedupeSseLine(`data: ${JSON.stringify(chunk)}`);
    expect(JSON.parse(out.slice(6))).toEqual({ choices: chunk.choices });
  });

  it("keeps native-only chunks and non-data lines untouched", () => {
    const native = `data: ${JSON.stringify({ response: "Hi" })}`;
    expect(dedupeSseLine(native)).toBe(native);
    expect(dedupeSseLine("data: [DONE]")).toBe("data: [DONE]");
    expect(dedupeSseLine("")).toBe("");
    expect(dedupeSseLine("data: {broken")).toBe("data: {broken");
  });
});

describe("dedupeSseStream", () => {
  it("handles events split across byte chunks", async () => {
    const event = `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`;
    const bytes = new TextEncoder().encode(event);
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 17));
        controller.enqueue(bytes.slice(17));
        controller.close();
      }
    });
    const text = await new Response(
      source.pipeThrough(dedupeSseStream())
    ).text();
    expect(text).not.toContain('"response"');
    expect(text).toContain('"content":"Hello"');
    expect(text).toContain("data: [DONE]");
  });
});
