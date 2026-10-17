import { describe, expect, it } from "vitest";
import { chatReducer, initialState, type Action } from "./chatReducer";

const run = (...actions: Action[]) => actions.reduce(chatReducer, initialState);
const sent: Action = { type: "sent", userId: "u1", assistantId: "a1", text: "hi" };

describe("chatReducer", () => {
  it("adds the user message and an empty streaming assistant message", () => {
    const s = run(sent);
    expect(s.streaming).toBe(true);
    expect(s.messages.map((m) => [m.role, m.status])).toEqual([["user", "done"], ["assistant", "streaming"]]);
  });

  it("appends deltas to the last message only", () => {
    const s = run(sent, { type: "delta", text: "Hel" }, { type: "delta", text: "lo" });
    expect(s.messages[0].content).toBe("hi");
    expect(s.messages[1].content).toBe("Hello");
  });

  it("finishes with usage attached", () => {
    const usage = { input_tokens: 10, output_tokens: 5, cost_usd: 0.0001 };
    const s = run(sent, { type: "delta", text: "ok" }, { type: "usage", usage }, { type: "finished" });
    expect(s.streaming).toBe(false);
    expect(s.messages[1]).toMatchObject({ status: "done", usage });
  });

  it("keeps the partial text when stopped", () => {
    const s = run(sent, { type: "delta", text: "partial" }, { type: "stopped" });
    expect(s.messages[1]).toMatchObject({ status: "stopped", content: "partial" });
    expect(s.streaming).toBe(false);
  });

  it("marks the message as failed with the error text", () => {
    const s = run(sent, { type: "failed", message: "rate limited" });
    expect(s.messages[1]).toMatchObject({ status: "error", error: "rate limited" });
  });

  it("regenerating replaces the last assistant message", () => {
    const s = run(sent, { type: "delta", text: "old" }, { type: "finished" }, { type: "regenerating", assistantId: "a2" });
    expect(s.messages.map((m) => m.id)).toEqual(["u1", "a2"]);
    expect(s.messages[1].content).toBe("");
  });

  it("finished does not overwrite a stopped message", () => {
    const s = run(sent, { type: "stopped" }, { type: "finished" });
    expect(s.messages[1].status).toBe("stopped");
  });

  it("is immutable: the previous state object is not changed", () => {
    const before = run(sent);
    const snapshot = JSON.stringify(before);
    chatReducer(before, { type: "delta", text: "x" });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
