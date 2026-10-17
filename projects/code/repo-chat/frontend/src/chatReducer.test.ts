import { describe, expect, it } from "vitest";
import { initialState, reducer, type Action } from "./chatReducer";
import type { AskEvent } from "./types";

const ev = (event: AskEvent): Action => ({ type: "event", event });
const run = (...actions: Action[]) => actions.reduce(reducer, initialState);
const asked: Action = { type: "asked", id: "t1", question: "Where is the retry delay?" };
const hit = { path: "jobq/retry.py", start: 20, end: 29, kind: "function", name: "backoff_delay", score: 4.7, reasons: ["matches: retry, delay"], expanded: false };

describe("chat reducer", () => {
  it("collects what was found, then the streamed words, then the checked citations and the cost", () => {
    const s = run(asked, ev({ type: "retrieval", hits: [hit], terms: ["retry", "delay"] }), ev({ type: "delta", text: "It is " }), ev({ type: "delta", text: "backoff_delay." }),
      ev({ type: "citations", items: [{ path: "jobq/retry.py", start: 20, end: 29, status: "valid" }], uncited: false }),
      ev({ type: "usage", input_tokens: 900, output_tokens: 60, cost_usd: 0.002 }), ev({ type: "done" }));
    expect(s.turns[0]).toMatchObject({ text: "It is backoff_delay.", status: "done", hits: [hit], terms: ["retry", "delay"], usage: { input_tokens: 900 } });
    expect(s.turns[0].citations).toHaveLength(1);
    expect(s.busy).toBe(false);
  });

  it("is busy and has no verdict on citations while the answer is still streaming", () => {
    const s = run(asked, ev({ type: "delta", text: "see [jobq/retry.py:20-29]" }));
    expect(s.busy).toBe(true);
    expect(s.turns[0]).toMatchObject({ status: "working", citations: null });
  });

  it("an error ends the run and keeps what had already arrived", () => {
    const s = run(asked, ev({ type: "delta", text: "partial" }), ev({ type: "error", code: "rate_limited", message: "Slow down", retryable: true }));
    expect(s).toMatchObject({ busy: false, turns: [{ status: "error", error: "Slow down", text: "partial" }] });
  });

  it("stop and a lost connection end the run too, and only the newest turn changes", () => {
    const two = run(asked, ev({ type: "done" }), { type: "asked", id: "t2", question: "Second?" }, { type: "stopped" });
    expect(two.turns.map((t) => t.status)).toEqual(["done", "stopped"]);
    expect(run(asked, { type: "failed", message: "Could not reach the server." }).turns[0]).toMatchObject({ status: "error", error: "Could not reach the server." });
  });

  it("clearing starts again from nothing, and does not mutate the earlier state", () => {
    const before = run(asked);
    const frozen = JSON.stringify(before);
    run(asked, ev({ type: "delta", text: "x" }));
    expect(JSON.stringify(before)).toBe(frozen);
    expect(reducer(before, { type: "clear" })).toEqual(initialState);
  });
});
