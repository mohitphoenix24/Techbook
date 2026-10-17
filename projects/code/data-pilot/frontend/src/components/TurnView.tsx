import { useEffect, useState } from "react";
import { answerOf, notesOf, type Turn } from "../agentReducer";
import type { ChartData, TableData } from "../types";
import { Chart } from "./Chart";
import { ResultTable } from "./ResultTable";
import { Sql } from "./Sql";
import { StepCard } from "./StepCard";

// region: turn
export function TurnView({ turn }: { turn: Turn }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { if (turn.status === "done") setOpen(false); }, [turn.status]);       // fold the steps away once the answer is ready

  const notes = notesOf(turn);
  const tables = turn.steps.filter((s) => s.result?.ok && s.result.ui.type === "table");
  const table = tables[tables.length - 1]?.result?.ui as TableData | undefined;
  const chart = [...turn.steps].reverse().find((s) => s.result?.ok && s.result.ui.type === "chart")?.result?.ui as ChartData | undefined;
  const answer = answerOf(turn);

  return (
    <section className="turn" data-status={turn.status}>
      <div className="question">{turn.question}</div>

      {turn.steps.length > 0 && (
        <details className="steps" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary>{turn.status === "working" ? "Working…" : `How I found this · ${turn.steps.length} steps`}</summary>
          <ol>{turn.steps.map((s) => <StepCard key={s.id} step={s} note={notes[s.turn]?.trim() && s === turn.steps.find((x) => x.turn === s.turn) ? notes[s.turn] : undefined} />)}</ol>
        </details>
      )}

      {turn.status === "working" && !answer && turn.steps.every((s) => s.result) && <p className="muted thinking">Thinking…</p>}
      {answer && <p className="answer">{answer}{turn.status === "working" && <span className="caret" aria-hidden />}</p>}
      {chart && <Chart data={chart} />}
      {table && <ResultTable data={table} />}
      {turn.queries.length > 0 && <details className="used"><summary>SQL used</summary><Sql sql={turn.queries[turn.queries.length - 1]} /></details>}

      {turn.status === "stopped" && <p className="flag">⏹ Stopped.</p>}
      {turn.status === "error" && <p className="flag error" role="alert">⚠ {turn.error}</p>}
      {turn.usage && <p className="usage muted">{turn.turns} model call{turn.turns === 1 ? "" : "s"} · {turn.usage.input_tokens} in · {turn.usage.output_tokens} out · ${turn.usage.cost_usd.toFixed(4)}</p>}
    </section>
  );
}
// endregion: turn
