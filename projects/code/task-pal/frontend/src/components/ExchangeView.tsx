import { useEffect, useState } from "react";
import type { Exchange } from "../chatReducer";
import { inlineParts } from "../format";
import { StepList } from "./StepList";

export function ExchangeView({ x }: { x: Exchange }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { if (x.status === "done") setOpen(false); }, [x.status]);        // fold the steps away once the answer is ready

  return (
    <section className="exchange" data-status={x.status}>
      <div className="question">{x.question}</div>
      {x.steps.length > 0 && (
        <details className="trace" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary>{x.status === "working" ? "Working…" : `What I did · ${x.steps.length} step${x.steps.length === 1 ? "" : "s"}`}</summary>
          <StepList steps={x.steps} />
        </details>
      )}
      {x.status === "working" && x.steps.every((s) => s.result) && <p className="muted thinking">Thinking…</p>}
      {x.status === "done" && <p className="answer">{inlineParts(x.answer || "Done.").map((p, i) => p.kind === "bold" ? <b key={i}>{p.text}</b> : p.kind === "code" ? <code key={i}>{p.text}</code> : p.text)}</p>}
      {x.status === "stopped" && <p className="flag">⏹ Stopped.</p>}
      {x.status === "error" && <p className="flag error" role="alert">⚠ {x.error}</p>}
      {x.usage && <p className="usage muted">{x.usage.input_tokens} in · {x.usage.output_tokens} out · ${x.usage.cost_usd.toFixed(4)}</p>}
    </section>
  );
}
