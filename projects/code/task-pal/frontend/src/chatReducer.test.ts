import { describe, expect, it } from "vitest";
import { historyOf, initialState, reducer, type State } from "./chatReducer";
import type { AgentEvent } from "./types";

const usage = { input_tokens: 300, output_tokens: 60, cost_usd: 0.0024 };
const run = (events: AgentEvent[], from: State = reducer(initialState, { type: "asked", id: "1", question: "add milk" })) =>
  events.reduce((s, event) => reducer(s, { type: "event", event }), from);

// region: reducer-tests
describe("chat reducer", () => {
  it("starts an exchange when a question is asked", () => {
    const s = reducer(initialState, { type: "asked", id: "1", question: "hi" });
    expect(s.busy).toBe(true);
    expect(s.exchanges[0]).toMatchObject({ question: "hi", status: "working", steps: [] });
  });

  it("shows a tool running, then its result", () => {
    const calling = run([{ type: "step", step: 0 }, { type: "tool_call", step: 0, id: "t1", name: "add_task", input: { title: "milk" } }]);
    expect(calling.exchanges[0].steps[0].result).toBeNull();
    const done = run([{ type: "tool_result", id: "t1", name: "add_task", ok: true, summary: "added #1", changed: true }], calling);
    expect(done.exchanges[0].steps[0].result).toEqual({ ok: true, summary: "added #1" });
  });

  it("gives a note to the first tool call that follows it, once", () => {
    const s = run([
      { type: "note", step: 0, text: "Let me check the date." },
      { type: "tool_call", step: 0, id: "a", name: "get_today", input: {} },
      { type: "tool_call", step: 0, id: "b", name: "list_tasks", input: {} },
    ]);
    expect(s.exchanges[0].steps.map((x) => x.note)).toEqual(["Let me check the date.", undefined]);
  });

  it("finishes with the answer and the usage, and is no longer busy", () => {
    const s = run([{ type: "done", answer: "Added.", steps: 2, usage }]);
    expect(s.busy).toBe(false);
    expect(s.exchanges[0]).toMatchObject({ status: "done", answer: "Added.", usage });
  });

  it("keeps the steps when an error ends the run", () => {
    const s = run([
      { type: "tool_call", step: 0, id: "a", name: "get_today", input: {} },
      { type: "error", code: "rate_limited", message: "Too many requests", retryable: true },
    ]);
    expect(s.busy).toBe(false);
    expect(s.exchanges[0]).toMatchObject({ status: "error", error: "Too many requests" });
    expect(s.exchanges[0].steps).toHaveLength(1);
  });

  it("handles stop and network failure", () => {
    const asked = reducer(initialState, { type: "asked", id: "1", question: "q" });
    expect(reducer(asked, { type: "stopped" })).toMatchObject({ busy: false, exchanges: [{ status: "stopped" }] });
    expect(reducer(asked, { type: "failed", message: "offline" }).exchanges[0].error).toBe("offline");
  });

  it("sends only finished exchanges back as history", () => {
    let s = run([{ type: "done", answer: "Added milk.", steps: 1, usage }]);
    s = reducer(s, { type: "asked", id: "2", question: "and eggs" });
    expect(historyOf(s)).toEqual([{ role: "user", text: "add milk" }, { role: "assistant", text: "Added milk." }]);
  });

  it("limits how much history is sent", () => {
    let s: State = initialState;
    for (let i = 0; i < 10; i++) {
      s = reducer(s, { type: "asked", id: String(i), question: `q${i}` });
      s = run([{ type: "done", answer: `a${i}`, steps: 1, usage }], s);
    }
    const h = historyOf(s, 3);
    expect(h).toHaveLength(6);
    expect(h[0].text).toBe("q7");
  });

  it("clears everything", () => {
    expect(reducer(run([{ type: "step", step: 0 }]), { type: "clear" })).toEqual(initialState);
  });
});
// endregion: reducer-tests
