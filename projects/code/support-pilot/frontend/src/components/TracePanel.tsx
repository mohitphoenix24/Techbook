import { useEffect, useState } from "react";
import { getTrace } from "../api";
import { usd } from "../format";
import type { Trace } from "../types";
import { formatMs, layout } from "../waterfall";

// region: trace
export function TracePanel({ ticketId, refresh }: { ticketId: number; refresh: number }) {
  const [trace, setTrace] = useState<Trace | null>(null);
  useEffect(() => { getTrace(ticketId).then(setTrace).catch(() => setTrace(null)); }, [ticketId, refresh]);
  if (!trace) return <p className="muted">No trace yet. Process the ticket first.</p>;

  const rows = layout(trace.spans);
  const s = trace.summary;
  return (
    <section className="trace" aria-label="Trace">
      <p className="muted small">{s.spans} steps · {formatMs(s.duration_ms)} · {s.tokens} tokens · {usd(s.cost_usd)}{s.errors ? ` · ${s.errors} error(s)` : ""}</p>
      <ol>
        {rows.map(({ span, depth, left, width }) => (
          <li key={span.id} className={span.status} style={{ paddingLeft: depth * 14 }}>
            <span className="name">{span.name}</span>
            <span className="lane" aria-hidden><span className="bar" style={{ left: `${left}%`, width: `${width}%` }} /></span>
            <span className="muted small">{formatMs(span.duration_ms)}</span>
            <span className="muted small attrs">{describe(span.attrs)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The few attributes worth reading at a glance. Personal data is never put into a span, so nothing here needs hiding. */
function describe(attrs: Record<string, unknown>): string {
  const bits: string[] = [];
  if (attrs.model) bits.push(String(attrs.model));
  if (typeof attrs.attempts === "number" && attrs.attempts > 1) bits.push(`${attrs.attempts} tries`);
  if (attrs.cached) bits.push("cached");
  if (attrs.repaired) bits.push("repaired");
  if (typeof attrs.cost_usd === "number" && attrs.cost_usd > 0) bits.push(usd(attrs.cost_usd));
  if (Array.isArray(attrs.failed) && attrs.failed.length) bits.push(`failed: ${attrs.failed.join(", ")}`);
  if (attrs.error) bits.push(String(attrs.error));
  return bits.join(" · ");
}
// endregion: trace
