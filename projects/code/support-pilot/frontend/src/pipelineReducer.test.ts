import { describe, expect, it } from "vitest";
import { idle, runReducer, type RunAction } from "./pipelineReducer";
import type { PipelineEvent } from "./types";

const ev = (event: PipelineEvent): RunAction => ({ type: "event", event });
const play = (...actions: RunAction[]) => actions.reduce(runReducer, idle);
const trace = { spans: 3, duration_ms: 120, cost_usd: 0.002, tokens: 400, errors: 0, stages: ["ticket"] };

describe("pipeline reducer", () => {
  it("shows each stage as running, then done with its summary and time", () => {
    const s = play({ type: "start" }, ev({ type: "stage", name: "triage", status: "start" }));
    expect(s.stages).toEqual([{ name: "triage", status: "running", summary: "", ms: null }]);
    const done = runReducer(s, ev({ type: "stage", name: "triage", status: "done", summary: "refund, normal", ms: 41 }));
    expect(done.stages).toEqual([{ name: "triage", status: "done", summary: "refund, normal", ms: 41 }]);
  });

  it("adds stages that only report when they finish, in the order they appear", () => {
    const s = play({ type: "start" }, ev({ type: "stage", name: "redact", status: "start" }), ev({ type: "stage", name: "redact", status: "done", summary: "x", ms: 1 }),
                   ev({ type: "stage", name: "decide", status: "done", summary: "refund", ms: 0 }));
    expect(s.stages.map((x) => x.name)).toEqual(["redact", "decide"]);
  });

  it("streams the draft word by word, and a reset forgets the first attempt before the revision streams in", () => {
    const s = play({ type: "start" }, ev({ type: "delta", text: "Hi " }), ev({ type: "delta", text: "Asha" }));
    expect(s.text).toBe("Hi Asha");
    const revised = play({ type: "start" }, ev({ type: "delta", text: "We guarantee it" }), ev({ type: "stage", name: "revise", status: "start" }), ev({ type: "reset" }), ev({ type: "delta", text: "Better" }));
    expect(revised.text).toBe("Better");
    expect(revised.revised).toBe(true);
  });

  it("finishes with the cost, and an error stops every stage that was still running", () => {
    expect(play({ type: "start" }, ev({ type: "done", status: "drafted", trace }))).toMatchObject({ phase: "done", cost: 0.002 });
    const failed = play({ type: "start" }, ev({ type: "stage", name: "triage", status: "start" }), ev({ type: "error", code: "rate_limited", message: "Slow down", retryable: true }));
    expect(failed).toMatchObject({ phase: "error", error: "Slow down" });
    expect(failed.stages[0]).toMatchObject({ status: "done", summary: "failed" });
  });

  it("a lost connection is reported without losing what had already happened", () => {
    const s = play({ type: "start" }, ev({ type: "stage", name: "redact", status: "done", summary: "ok", ms: 1 }), { type: "failed", message: "The connection was lost." });
    expect(s.phase).toBe("error");
    expect(s.stages).toHaveLength(1);
  });
});
