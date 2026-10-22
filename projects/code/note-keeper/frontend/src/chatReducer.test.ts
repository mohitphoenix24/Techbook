import { describe, expect, it } from "vitest";
import { historyOf, initialState, reducer, type State } from "./chatReducer";
import type { AgentEvent } from "./types";

const usage = { input_tokens: 900, output_tokens: 120, cost_usd: 0.006 };
const asked = () => reducer(initialState, { type: "asked", id: "1", question: "summarise my meeting note" });
const run = (events: AgentEvent[], from: State = asked()) => events.reduce((s, event) => reducer(s, { type: "event", event }), from);

describe("chat reducer", () => {
  it("starts an exchange when a question is asked", () => {
    const s = asked();
    expect(s.busy).toBe(true);
    expect(s.exchanges[0]).toMatchObject({ question: "summarise my meeting note", status: "working", steps: [] });
  });

  it("shows a tool running, then its result", () => {
    const calling = run([{ type: "tool_call", step: 0, id: "t1", name: "read_note", input: { name: "meeting-2026-10-12" } }]);
    expect(calling.exchanges[0].steps[0].result).toBeNull();
    const done = run([{ type: "tool_result", id: "t1", name: "read_note", ok: true, summary: "812 characters", changed: false }], calling);
    expect(done.exchanges[0].steps[0].result).toEqual({ ok: true, summary: "812 characters" });
  });

  it("shows a refused tool call as a failed step, with the reason", () => {
    const s = run([
      { type: "tool_call", step: 0, id: "t1", name: "read_note", input: { name: "../etc/passwd" } },
      { type: "tool_result", id: "t1", name: "read_note", ok: false, summary: "refused", changed: false },
    ]);
    expect(s.exchanges[0].steps[0].result).toEqual({ ok: false, summary: "refused" });
  });

  it("gives a note to the first tool call that follows it, once", () => {
    const s = run([
      { type: "note", step: 0, text: "Let me read it." },
      { type: "tool_call", step: 0, id: "a", name: "read_note", input: {} },
      { type: "tool_call", step: 0, id: "b", name: "read_note", input: {} },
    ]);
    expect(s.exchanges[0].steps.map((x) => x.note)).toEqual(["Let me read it.", undefined]);
  });

  it("finishes with the answer and the usage, and is no longer busy", () => {
    const s = run([{ type: "done", answer: "Launch moved to 6 November.", steps: 2, usage }]);
    expect(s.busy).toBe(false);
    expect(s.exchanges[0]).toMatchObject({ status: "done", answer: "Launch moved to 6 November.", usage });
  });

  it("keeps the steps when an error ends the run", () => {
    const s = run([
      { type: "tool_call", step: 0, id: "a", name: "list_notes", input: {} },
      { type: "error", code: "rate_limited", message: "Too many requests", retryable: true },
    ]);
    expect(s).toMatchObject({ busy: false, exchanges: [{ status: "error", error: "Too many requests" }] });
    expect(s.exchanges[0].steps).toHaveLength(1);
  });

  it("handles stop, network failure and clear", () => {
    expect(reducer(asked(), { type: "stopped" })).toMatchObject({ busy: false, exchanges: [{ status: "stopped" }] });
    expect(reducer(asked(), { type: "failed", message: "offline" }).exchanges[0].error).toBe("offline");
    expect(reducer(run([{ type: "step", step: 0 }]), { type: "clear" })).toEqual(initialState);
  });

  it("sends only finished exchanges back as plain-text history, a limited number of them", () => {
    let s = run([{ type: "done", answer: "Done.", steps: 1, usage }]);
    s = reducer(s, { type: "asked", id: "2", question: "and the reading list?" });
    expect(historyOf(s)).toEqual([{ role: "user", text: "summarise my meeting note" }, { role: "assistant", text: "Done." }]);
    let many: State = initialState;
    for (let i = 0; i < 10; i++) {
      many = reducer(many, { type: "asked", id: String(i), question: `q${i}` });
      many = run([{ type: "done", answer: `a${i}`, steps: 1, usage }], many);
    }
    expect(historyOf(many, 3).map((t) => t.text)).toEqual(["q7", "a7", "q8", "a8", "q9", "a9"]);
  });
});
