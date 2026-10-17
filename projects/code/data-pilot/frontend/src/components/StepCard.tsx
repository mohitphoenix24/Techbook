import type { Step } from "../agentReducer";
import { Sql } from "./Sql";

const LABEL: Record<string, string> = {
  list_tables: "Looked at the list of tables",
  describe_table: "Looked at a table",
  run_sql: "Ran a query",
  show_chart: "Drew a chart",
};

// region: step
export function StepCard({ step, note }: { step: Step; note?: string }) {
  const { name, input, result } = step;
  const state = result === null ? "running" : result.ok ? "ok" : "failed";
  return (
    <li className={`step ${state}`}>
      {note && <p className="note">{note}</p>}
      <div className="head">
        <span className="dot" aria-hidden />
        <b>{LABEL[name] ?? name}</b>
        {name === "describe_table" && <code>{String(input.table)}</code>}
        {name === "show_chart" && <code>{String(input.kind)} of {String(input.y)} by {String(input.x)}</code>}
        <span className="status">{result === null ? "running…" : result.ok ? result.summary : "blocked or failed"}</span>
      </div>
      {name === "run_sql" && <Sql sql={String(input.query)} />}
      {result && !result.ok && <p className="problem" role="alert">{result.summary}</p>}
    </li>
  );
}
// endregion: step
