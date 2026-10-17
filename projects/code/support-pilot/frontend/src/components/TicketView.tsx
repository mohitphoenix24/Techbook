import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import * as api from "../api";
import { ACTION_LABEL, ago, STATUS_LABEL } from "../format";
import { idle, runReducer } from "../pipelineReducer";
import type { Me, Simulate, Ticket } from "../types";
import { DraftPanel } from "./DraftPanel";
import { Pipeline } from "./Pipeline";
import { TracePanel } from "./TracePanel";

const SIMULATE: [Simulate, string][] = [
  ["none", "Normal"], ["overpromise", "Draft over-promises (it rewrites it)"], ["leak", "Draft leaks a phone number (it rewrites it)"], ["wrong_amount", "Draft quotes the wrong amount"],
  ["stubborn", "Draft stays wrong (a person must fix it)"], ["flaky", "Provider hiccups (retries)"],
];

// region: ticket
export function TicketView({ id, me, provider, onChanged }: { id: number; me: Me; provider: string; onChanged: () => void }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [run, dispatch] = useReducer(runReducer, idle);
  const [simulate, setSimulate] = useState<Simulate>("none");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const [traceVersion, setTraceVersion] = useState(0);
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    try { setTicket(await api.getTicket(id)); setError(null); } catch (e) { setError(e instanceof api.ApiError ? e.message : "Could not load the ticket."); }
  }, [id]);

  useEffect(() => { abort.current?.abort(); dispatch({ type: "clear" }); setShowTrace(false); setTicket(null); void load(); return () => abort.current?.abort(); }, [load]);

  async function act(work: () => Promise<Ticket>) {
    setBusy(true);
    setError(null);
    try { setTicket(await work()); onChanged(); } catch (e) { setError(e instanceof api.ApiError ? e.message : "Something went wrong."); } finally { setBusy(false); }
  }

  async function process() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    dispatch({ type: "start" });
    setError(null);
    try {
      for await (const event of api.processStream(id, simulate, controller.signal)) dispatch({ type: "event", event });
    } catch (e) {
      if (!controller.signal.aborted) dispatch({ type: "failed", message: e instanceof api.ApiError ? e.message : "The connection was lost." });
    }
    await load();
    setTraceVersion((v) => v + 1);
    onChanged();
  }

  if (error && !ticket) return <p className="problem" role="alert">{error}</p>;
  if (!ticket) return <p className="muted">Loading…</p>;
  const t = ticket.triage;
  const running = run.phase === "running";

  return (
    <article className="ticket" data-status={ticket.status}>
      <header>
        <h2>{ticket.subject}</h2>
        <p className="muted">{ticket.from_email} · {ticket.channel} · {ago(ticket.created_at)} · <span className={`badge ${ticket.status}`}>{STATUS_LABEL[ticket.status]}</span></p>
      </header>

      <section className="message" aria-label="What the customer wrote">
        <p>{ticket.body}</p>
        {ticket.redactions && Object.keys(ticket.redactions).length > 0 && (
          <p className="muted small">🔒 {Object.values(ticket.redactions).reduce((a, b) => a + b, 0)} personal detail(s) were hidden from the model: {Object.entries(ticket.redactions).map(([k, n]) => `${k.toLowerCase()} ×${n}`).join(", ")}.</p>
        )}
      </section>

      {t && (
        <section className="triage" aria-label="Triage">
          <span className={`badge priority ${t.priority}`}>{t.priority}</span>
          <span className="badge">{t.category.replace("_", " ")}</span>
          <span className="badge">{t.sentiment}</span>
          <span className="badge">{t.language}</span>
          {t.order_ids.map((o) => <span key={o} className="badge order">{o}</span>)}
          <p className="small muted">{t.summary}</p>
        </section>
      )}

      {ticket.status === "escalated" && <p className="note" role="status">The copilot did not draft a reply: this needs a person to read it. A team lead can close it once it has been dealt with.</p>}

      {ticket.actions.includes("process") && (
        <div className="row-buttons process">
          <button className="primary" disabled={running || busy} onClick={process}>{ticket.draft ? "Draft again" : "Draft a reply"}</button>
          {provider === "mock" && (
            <label className="small muted">Simulate
              <select value={simulate} onChange={(e) => setSimulate(e.target.value as Simulate)} disabled={running}>
                {SIMULATE.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </label>
          )}
          {running && <button onClick={() => abort.current?.abort()}>Stop watching</button>}
        </div>
      )}

      <Pipeline run={run} />
      {error && <p className="problem" role="alert">{error}</p>}

      {ticket.draft && !running && (
        <DraftPanel key={ticket.draft.version} draft={ticket.draft} status={ticket.status} actions={ticket.actions} busy={busy}
                    onEdit={(text) => act(() => api.editDraft(id, text))} onApprove={() => act(() => api.approve(id))}
                    onReject={(reason) => act(() => api.reject(id, reason))} onSend={() => act(() => api.send(id))} />
      )}

      {ticket.messages.length > 0 && (
        <section className="sent" aria-label="Sent reply">
          <h3>Sent to the customer</h3>
          {ticket.messages.map((m, i) => <p key={i} className="text">{m.text}<span className="muted small"> — {m.sent_by}, {ago(m.created_at)}</span></p>)}
        </section>
      )}

      {ticket.actions.includes("close") && <div className="row-buttons"><button disabled={busy} onClick={() => act(() => api.close(id))}>Close ticket</button></div>}

      <details className="audit">
        <summary>Audit trail ({ticket.audit.length})</summary>
        <ul>{ticket.audit.map((a, i) => <li key={i}><b>{a.actor}</b> {ACTION_LABEL[a.action] ?? a.action} <span className="muted small">{a.detail && `· ${a.detail} `}· {ago(a.ts)}</span></li>)}</ul>
      </details>

      {ticket.has_trace && (
        <details className="tracebox" open={showTrace} onToggle={(e) => setShowTrace(e.currentTarget.open)}>
          <summary>Trace: how this draft was made</summary>
          {showTrace && <TracePanel ticketId={id} refresh={traceVersion} />}
        </details>
      )}
      <span className="sr-only">{me.name}</span>
    </article>
  );
}
// endregion: ticket
