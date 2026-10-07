import { describe, expect, it } from "vitest";
import { recentMessages } from "../src/llm/context-window";

const msgs = ["user", "assistant", "user", "assistant", "user"].map(
  (role, i) => ({ role, i })
);

describe("recentMessages", () => {
  it("keeps the last messages and starts at a user turn", () => {
    expect(recentMessages(msgs, 4).map((m) => m.i)).toEqual([2, 3, 4]);
    expect(recentMessages(msgs, 3).map((m) => m.i)).toEqual([2, 3, 4]);
    expect(recentMessages(msgs, 10)).toHaveLength(5);
  });
});
