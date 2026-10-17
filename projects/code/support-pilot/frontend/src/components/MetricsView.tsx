import { useEffect, useState } from "react";
import { ApiError, getMetrics } from "../api";
import { usd } from "../format";
import type { Metrics } from "../types";
import { formatMs } from "../waterfall";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

// region: metrics
export function MetricsView() {
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getMetrics().then(setM).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the metrics.")); }, []);
  if (error) return <p className="problem" role="alert">{error}</p>;
  if (!m) return <p className="muted">Loading…</p>;
  const g = m.gateway;
  return (
    <div className="metrics">
      <h2>The desk</h2>
      <div className="cards">
        <Card label="Tickets" value={String(m.tickets)} />
        <Card label="Waiting for a lead" value={String(m.by_status.needs_lead ?? 0)} />
        <Card label="Needs a person" value={String(m.by_status.escalated ?? 0)} />
        <Card label="Sent" value={String(m.sent)} />
      </div>
      <h2>The copilot</h2>
      <div className="cards">
        <Card label="Approved as written" value={pct(m.edit_rate === null ? null : 1 - m.edit_rate)} hint="drafts nobody had to edit" />
        <Card label="Approval rate" value={pct(m.approval_rate)} hint={`${m.approved} approved, ${m.rejected} rejected`} />
        <Card label="Time per ticket" value={m.processed_runs ? formatMs(m.avg_duration_ms) : "—"} />
        <Card label="Cost per ticket" value={m.processed_runs ? usd(m.avg_cost_usd) : "—"} />
      </div>
      <h2>The gateway</h2>
      <div className="cards">
        <Card label="Model calls" value={String(g.calls)} hint={`${g.cache_hits} answered from the cache`} />
        <Card label="Retries" value={String(g.retries)} hint={`${g.failures} failed attempts`} />
        <Card label="Fallbacks" value={String(g.fallbacks)} />
        <Card label="Turned away" value={String(g.rate_limited + g.budget_blocked)} hint={`${g.rate_limited} rate limit, ${g.budget_blocked} budget`} />
      </div>
      <p className="muted small">Circuit breakers: {Object.entries(g.breakers).map(([k, v]) => `${k} ${v}`).join(", ")} · spent so far: {usd(g.cost_usd)}</p>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="card"><span className="muted small">{label}</span><b>{value}</b>{hint && <span className="muted small">{hint}</span>}</div>;
}
// endregion: metrics
