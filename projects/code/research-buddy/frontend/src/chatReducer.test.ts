import { describe, expect, it } from "vitest";
import { historyOf, initialState, reducer, type State } from "./chatReducer";
import type { AgentEvent, Source } from "./types";

const usage = { input_tokens: 18000, output_tokens: 2800, searches: 2, cost_usd: 0.15 };
const src: Source = { n: 1, title: "Pune - Wikipedia", url: "https://en.wikipedia.org/wiki/Pune", quote: "Pune has 7.4 million" };
const asked = () => reducer(initialState, { type: "asked", id: "1", question: "population of pune?" });
const run = (events: AgentEvent[], from: State = asked()) => events.reduce((s, event) => reducer(s, { type: "event", event }), from);

describe("chat reducer", () => {
  it("starts an exchange when a question is asked", () => {
    expect(asked()).toMatchObject({ busy: true, exchanges: [{ question: "population of pune?", status: "working", searches: [] }] });
  });

  it("follows a search from running to its results", () => {
    const running = run([{ type: "search", id: "s1", query: "population of pune" }]);
    expect(running.exchanges[0].searches[0]).toMatchObject({ query: "population of pune", state: "running" });
    const found = run([{ type: "search_result", id: "s1", ok: true, results: [{ title: "Pune", url: "https://x.org", age: null }] }], running);
    expect(found.exchanges[0].searches[0]).toMatchObject({ state: "ok", results: [{ title: "Pune", url: "https://x.org", age: null }] });
  });

  it("shows a failed search with its reason", () => {
    const s = run([{ type: "search", id: "s1", query: "q" }, { type: "search_result", id: "s1", ok: false, error: "The search limit for this question was reached." }]);
    expect(s.exchanges[0].searches[0]).toMatchObject({ state: "failed", error: "The search limit for this question was reached." });
  });

  it("keeps several searches apart", () => {
    const s = run([
      { type: "search", id: "a", query: "one" }, { type: "search", id: "b", query: "two" },
      { type: "search_result", id: "b", ok: true, results: [] },
    ]);
    expect(s.exchanges[0].searches.map((x) => x.state)).toEqual(["running", "ok"]);
  });

  it("tracks the calculator", () => {
    const s = run([
      { type: "tool_call", step: 1, id: "c1", name: "calculator", input: { expression: "7.4 * 1.1" } },
      { type: "tool_result", id: "c1", name: "calculator", ok: true, summary: "= 8.14" },
    ]);
    expect(s.exchanges[0].calcs).toEqual([{ id: "c1", expression: "7.4 * 1.1", result: { ok: true, summary: "= 8.14" } }]);
  });

  it("keeps what Claude said while working", () => {
    expect(run([{ type: "note", step: 0, text: "I'll search." }, { type: "note", step: 1, text: "Let me compute." }]).exchanges[0].notes).toEqual(["I'll search.", "Let me compute."]);
  });

  it("finishes with the answer, its sources and the usage", () => {
    const s = run([{ type: "done", answer: "Pune has 7.4 million people[1].", sources: [src], searched: [], steps: 2, usage }]);
    expect(s.busy).toBe(false);
    expect(s.exchanges[0]).toMatchObject({ status: "done", answer: "Pune has 7.4 million people[1].", sources: [src], usage });
  });

  it("keeps the searches when an error ends the run", () => {
    const s = run([{ type: "search", id: "s1", query: "q" }, { type: "error", code: "rate_limited", message: "Too many requests", retryable: true }]);
    expect(s).toMatchObject({ busy: false, exchanges: [{ status: "error", error: "Too many requests" }] });
    expect(s.exchanges[0].searches).toHaveLength(1);
  });

  it("handles stop, network failure and clear", () => {
    expect(reducer(asked(), { type: "stopped" })).toMatchObject({ busy: false, exchanges: [{ status: "stopped" }] });
    expect(reducer(asked(), { type: "failed", message: "offline" }).exchanges[0].error).toBe("offline");
    expect(reducer(asked(), { type: "clear" })).toEqual(initialState);
  });

  it("sends only finished exchanges back as plain-text history, a limited number of them", () => {
    let s = run([{ type: "done", answer: "7.4 million[1].", sources: [src], searched: [], steps: 2, usage }]);
    s = reducer(s, { type: "asked", id: "2", question: "and Nashik?" });
    expect(historyOf(s)).toEqual([{ role: "user", text: "population of pune?" }, { role: "assistant", text: "7.4 million[1]." }]);
    let many: State = initialState;
    for (let i = 0; i < 8; i++) {
      many = reducer(many, { type: "asked", id: String(i), question: `q${i}` });
      many = run([{ type: "done", answer: `a${i}`, sources: [], searched: [], steps: 1, usage }], many);
    }
    expect(historyOf(many, 2).map((t) => t.text)).toEqual(["q6", "a6", "q7", "a7"]);
  });
});
