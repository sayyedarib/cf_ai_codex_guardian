import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import {
  mightBeToolCall,
  parseLeakedToolCalls,
  recoverToolCallsStream
} from "../src/llm/leaked-tool-calls";

const tools = new Set(["reviewPullRequest", "listCodex"]);

describe("parseLeakedToolCalls", () => {
  it("parses a leaked call with parameters or arguments", () => {
    expect(
      parseLeakedToolCalls(
        '{"name": "reviewPullRequest", "parameters": {"pullRequest": "a/b#1"}}',
        tools
      )
    ).toEqual([
      { toolName: "reviewPullRequest", input: '{"pullRequest":"a/b#1"}' }
    ]);
    expect(
      parseLeakedToolCalls(
        '```json\n{"name": "listCodex", "arguments": {}}\n```',
        tools
      )
    ).toEqual([{ toolName: "listCodex", input: "{}" }]);
  });

  it("rejects unknown tools, prose and broken JSON", () => {
    expect(
      parseLeakedToolCalls('{"name": "deleteRepo", "parameters": {}}', tools)
    ).toEqual([]);
    expect(parseLeakedToolCalls("Here are the rules.", tools)).toEqual([]);
    expect(parseLeakedToolCalls('{"name": "listCodex", ', tools)).toEqual([]);
    expect(parseLeakedToolCalls('{"rules": []}', tools)).toEqual([]);
  });
});

describe("mightBeToolCall", () => {
  it("holds back only text that starts like JSON", () => {
    expect(mightBeToolCall("  {")).toBe(true);
    expect(mightBeToolCall("```")).toBe(true);
    expect(mightBeToolCall("")).toBe(true);
    expect(mightBeToolCall("The codex")).toBe(false);
  });
});

async function run(parts: LanguageModelV4StreamPart[]) {
  const source = new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) {
      parts.forEach((p) => controller.enqueue(p));
      controller.close();
    }
  });
  const out: LanguageModelV4StreamPart[] = [];
  const reader = source.pipeThrough(recoverToolCallsStream(tools)).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

const finish = {
  type: "finish",
  finishReason: { unified: "stop", raw: "stop" },
  usage: {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 }
  }
} as LanguageModelV4StreamPart;

describe("recoverToolCallsStream", () => {
  it("turns a leaked call into a real tool call and fixes the finish reason", async () => {
    const out = await run([
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: '{"name": "listCodex", ' },
      { type: "text-delta", id: "t", delta: '"parameters": {}}' },
      { type: "text-end", id: "t" },
      finish
    ]);
    expect(out.map((p) => p.type)).toEqual([
      "tool-input-start",
      "tool-input-delta",
      "tool-input-end",
      "tool-call",
      "finish"
    ]);
    expect(out[3]).toMatchObject({ toolName: "listCodex", input: "{}" });
    expect(out[4]).toMatchObject({ finishReason: { unified: "tool-calls" } });
  });

  it("streams normal text through as soon as it isn't JSON", async () => {
    const out = await run([
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "Hello" },
      { type: "text-delta", id: "t", delta: " there" },
      { type: "text-end", id: "t" },
      finish
    ]);
    expect(out).toEqual([
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "Hello" },
      { type: "text-delta", id: "t", delta: " there" },
      { type: "text-end", id: "t" },
      finish
    ]);
  });

  it("releases JSON-looking text that isn't a tool call", async () => {
    const out = await run([
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: '{"note": 1}' },
      { type: "text-end", id: "t" },
      finish
    ]);
    expect(out.map((p) => p.type)).toEqual([
      "text-start",
      "text-delta",
      "text-end",
      "finish"
    ]);
  });
});
