import { ago, STATUS_LABEL } from "../format";
import type { TicketSummary } from "../types";

const FILTERS = [["", "All"], ["new", "New"], ["drafted", "Draft ready"], ["needs_lead", "Needs lead"], ["escalated", "Needs a person"], ["approved", "Approved"], ["sent", "Sent"]];

// region: inbox
export function Inbox({ tickets, selected, status, query, onSelect, onStatus, onQuery }: {
  tickets: TicketSummary[]; selected: number | null; status: string; query: string;
  onSelect: (id: number) => void; onStatus: (s: string) => void; onQuery: (q: string) => void;
}) {
  return (
    <aside className="inbox" aria-label="Inbox">
      <input type="search" value={query} placeholder="Search subject or email" aria-label="Search tickets" onChange={(e) => onQuery(e.target.value)} />
      <div className="filters" role="group" aria-label="Filter by status">
        {FILTERS.map(([value, label]) => <button key={value} className={`chip ${status === value ? "on" : ""}`} aria-pressed={status === value} onClick={() => onStatus(value)}>{label}</button>)}
      </div>
      <ul>
        {tickets.map((t) => (
          <li key={t.id}>
            <button className={`row ${selected === t.id ? "on" : ""}`} onClick={() => onSelect(t.id)} aria-current={selected === t.id}>
              <span className={`dot ${t.priority ?? "none"}`} title={t.priority ? `${t.priority} priority` : "not triaged yet"} aria-hidden />
              <span className="body">
                <b>{t.subject}</b>
                <span className="muted small">{t.from_email} · {ago(t.created_at)}</span>
                <span className="small">{t.summary ?? "Not processed yet"}</span>
              </span>
              <span className={`badge ${t.status}`}>{STATUS_LABEL[t.status]}</span>
            </button>
          </li>
        ))}
        {tickets.length === 0 && <li className="muted empty">No tickets match.</li>}
      </ul>
    </aside>
  );
}
// endregion: inbox
