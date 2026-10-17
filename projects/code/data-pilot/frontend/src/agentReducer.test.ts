import { describe, expect, it } from "vitest";
import { answerOf, historyOf, initialState, notesOf, reducer, type Action } from "./agentReducer";
import type { AgentEvent } from "./types";

const ev = (event: AgentEvent): Action => ({ type: "event", event });
const run = (...actions: Action[]) => actions.reduce(reducer, initialState);
const asked: Action = { type: "asked", id: "t1", question: "Top customers?" };
const table = { type: "table" as const, sql: "SELECT 1", columns: ["a"], rows: [[1]], row_count: 1, truncated: false, ms: 1 };

const wholeRun: Action[] = [
  asked,
  ev({ type: "turn", turn: 0 }), ev({ type: "delta", turn: 0, text: "Let me look." }),
  ev({ type: "tool_call", turn: 0, id: "a", name: "run_sql", input: { query: "SELECT 1" } }),
  ev({ type: "tool_result", id: "a", name: "run_sql", ok: true, summary: "1 rows in 1 ms", ui: table }),
  ev({ type: "turn", turn: 1 }), ev({ type: "delta", turn: 1, text: "The answer " }), ev({ type: "delta", turn: 1, text: "is 1." }),
  ev({ type: "usage", input_tokens: 100, output_tokens: 20, cost_usd: 0.001 }),
  ev({ type: "done", answer: "The answer is 1.", queries: ["SELECT 1"] }),
];

describe("agent reducer", () => {
  it("collects steps, with a result attached to its call", () => {
    const t = run(...wholeRun).turns[0];
    expect(t.steps).toHaveLength(1);
    expect(t.steps[0]).toMatchObject({ name: "run_sql", result: { ok: true, summary: "1 rows in 1 ms" } });
    expect(t).toMatchObject({ status: "done", turns: 2, queries: ["SELECT 1"], usage: { input_tokens: 100 } });
  });

  it("a call has no result until its result event arrives", () => {
    const s = run(...wholeRun.slice(0, 4));
    expect(s.turns[0].steps[0].result).toBeNull();
    expect(s.busy).toBe(true);
  });

  it("separates the model's notes (turns that called tools) from the final answer", () => {
    const t = run(...wholeRun).turns[0];
    expect(notesOf(t)).toEqual({ 0: "Let me look." });
    expect(answerOf(t)).toBe("The answer is 1.");
  });

  it("while streaming, text of the newest turn counts as the answer until it calls a tool", () => {
    const t = run(asked, ev({ type: "turn", turn: 0 }), ev({ type: "delta", turn: 0, text: "Hel" })).turns[0];
    expect(answerOf(t)).toBe("Hel");
  });

  it("errors and stops end the run and free the composer", () => {
    expect(run(asked, ev({ type: "error", code: "too_many_steps", message: "Too many steps", retryable: false }))).toMatchObject({ busy: false, turns: [{ status: "error", error: "Too many steps" }] });
    expect(run(asked, { type: "stopped" })).toMatchObject({ busy: false, turns: [{ status: "stopped" }] });
  });

  it("sends back only finished turns, with their answers and queries", () => {
    const s = run(...wholeRun, asked, ev({ type: "turn", turn: 0 }));
    expect(historyOf(s)).toEqual([{ question: "Top customers?", answer: "The answer is 1.", queries: ["SELECT 1"] }]);
  });
});
