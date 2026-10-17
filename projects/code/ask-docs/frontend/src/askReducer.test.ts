import { describe, expect, it } from "vitest";
import { historyOf, initialState, reducer, type Action } from "./askReducer";
import type { Source } from "./types";

const src = (n: number): Source => ({ n, chunk_id: n, document_id: "d", document: "Handbook", page: 1, heading: "", text: "text", score: 1, vector_score: 0.3, keyword_score: 5, vector_rank: 1, keyword_rank: 1 });
const run = (...actions: Action[]) => actions.reduce(reducer, initialState);
const asked: Action = { type: "asked", id: "t1", question: "How many days?" };

describe("ask reducer", () => {
  it("walks through searching, streaming and done, keeping sources with the turn", () => {
    const s = run(asked, { type: "sources", sources: [src(1), src(2)], relevant: true }, { type: "delta", text: "24 " }, { type: "delta", text: "days [1]" },
      { type: "citations", citations: { used: [1], invalid: [], refused: false, uncited: false } }, { type: "usage", usage: { input_tokens: 9, output_tokens: 4, cost_usd: 0.001 } }, { type: "finished" });
    const t = s.turns[0];
    expect(t).toMatchObject({ status: "done", answer: "24 days [1]", relevant: true });
    expect(t.sources).toHaveLength(2);
    expect(t.citations?.used).toEqual([1]);
    expect(s.busy).toBe(false);
  });

  it("only shows a rewrite when the question really changed", () => {
    expect(run(asked, { type: "rewrite", standalone: "How many days?", rewritten: false }).turns[0].standalone).toBeNull();
    expect(run(asked, { type: "rewrite", standalone: "How many sick days?", rewritten: true }).turns[0].standalone).toBe("How many sick days?");
  });

  it("keeps the partial answer when stopped, and the message when it fails", () => {
    expect(run(asked, { type: "sources", sources: [], relevant: true }, { type: "delta", text: "24" }, { type: "stopped" }).turns[0]).toMatchObject({ status: "stopped", answer: "24" });
    expect(run(asked, { type: "failed", message: "Rate limited" }).turns[0]).toMatchObject({ status: "error", error: "Rate limited" });
  });

  it("builds the history from finished turns only, newest few", () => {
    const done = (id: string, q: string, a: string): Action[] => [{ type: "asked", id, question: q }, { type: "sources", sources: [], relevant: true }, { type: "delta", text: a }, { type: "finished" }];
    const s = run(...done("1", "q1", "a1"), ...done("2", "q2", "a2"), asked, { type: "sources", sources: [], relevant: true }, { type: "delta", text: "partial" });
    expect(historyOf(s)).toEqual([{ role: "user", content: "q1" }, { role: "assistant", content: "a1" }, { role: "user", content: "q2" }, { role: "assistant", content: "a2" }]);
    expect(historyOf(s, 1)).toEqual([{ role: "user", content: "q2" }, { role: "assistant", content: "a2" }]);
  });
});
