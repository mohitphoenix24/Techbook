import { useEffect, useState } from "react";
import type { Exchange } from "../chatReducer";
import { money, plural } from "../format";
import { Answer, Sources } from "./Answer";
import { ResearchTrail } from "./ResearchTrail";

export function ExchangeView({ x }: { x: Exchange }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { if (x.status === "done") setOpen(false); }, [x.status]);        // fold the trail away once the answer is ready
  const did = x.searches.length + x.calcs.length;

  return (
    <section className="exchange" data-status={x.status}>
      <div className="question">{x.question}</div>
      {did > 0 && (
        <details className="trace" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary>{x.status === "working" ? "Researching…" : `How I researched this · ${plural(x.searches.length, "search", "searches")}${x.calcs.length ? `, ${plural(x.calcs.length, "calculation")}` : ""}`}</summary>
          {x.notes.length > 0 && <p className="note">{x.notes[x.notes.length - 1]}</p>}
          <ResearchTrail x={x} />
        </details>
      )}
      {x.status === "working" && <p className="muted thinking" role="status">Researching. Searches can take up to a minute…</p>}
      {x.status === "done" && <Answer text={x.answer} sources={x.sources} />}
      {x.status === "done" && <Sources sources={x.sources} />}
      {x.status === "stopped" && <p className="flag">⏹ Stopped.</p>}
      {x.status === "error" && <p className="flag error" role="alert">⚠ {x.error}</p>}
      {x.usage && <p className="usage muted">{x.usage.input_tokens} in · {x.usage.output_tokens} out · {plural(x.usage.searches, "search", "searches")} · {money(x.usage.cost_usd)}</p>}
    </section>
  );
}
