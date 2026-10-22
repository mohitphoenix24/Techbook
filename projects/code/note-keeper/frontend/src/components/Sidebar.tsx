import { formatSize } from "../format";
import type { NoteInfo, Proposal } from "../types";
import { ProposalCard } from "./ProposalCard";

interface Props {
  notes: NoteInfo[];
  proposals: Proposal[];
  onOpen: (name: string) => void;
  onApply: (id: number) => Promise<void>;
  onReject: (id: number) => Promise<void>;
}

export function Sidebar({ notes, proposals, onOpen, onApply, onReject }: Props) {
  const pending = proposals.filter((p) => p.status === "pending");
  const decided = proposals.filter((p) => p.status !== "pending");
  return (
    <aside className="side">
      <section aria-label="Waiting for your approval">
        <h2>Waiting for you {pending.length > 0 && <span className="count">{pending.length}</span>}</h2>
        {pending.length === 0 && <p className="muted small">Nothing is waiting. When the agent wants to change a note, the change appears here for you to approve.</p>}
        {pending.map((p) => <ProposalCard key={p.id} p={p} onApply={onApply} onReject={onReject} />)}
        {decided.length > 0 && (
          <details className="decided">
            <summary>Decided ({decided.length})</summary>
            <ul>{decided.map((p) => <li key={p.id}><span className={`status ${p.status}`}>{p.status}</span> {p.action} <b>{p.name}</b></li>)}</ul>
          </details>
        )}
      </section>
      <section aria-label="Notes">
        <h2>Notes <span className="count">{notes.length}</span></h2>
        <ul className="notes">
          {notes.map((n) => (
            <li key={n.name}>
              <button onClick={() => onOpen(n.name)} aria-label={`Open ${n.name}`}>
                <span className="t">{n.title}</span>
                <span className="meta"><code>{n.name}</code><span>{formatSize(n.chars)}</span></span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
