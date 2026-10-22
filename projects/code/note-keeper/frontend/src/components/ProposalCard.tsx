import { useState } from "react";
import { ACTION_LABEL, diffStats } from "../format";
import type { Proposal } from "../types";
import { DiffView } from "./DiffView";

interface Props { p: Proposal; onApply: (id: number) => Promise<void>; onReject: (id: number) => Promise<void> }

// region: card
export function ProposalCard({ p, onApply, onReject }: Props) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { added, removed } = diffStats(p.diff);

  async function decide(action: (id: number) => Promise<void>) {
    setBusy(true);
    setProblem(null);
    try { await action(p.id); } catch (err) { setProblem(err instanceof Error ? err.message : "That did not work."); } finally { setBusy(false); }
  }

  return (
    <article className={`proposal ${p.action}`} aria-label={`Proposal ${p.id}`}>
      <header>
        <span className={`badge ${p.action}`}>{ACTION_LABEL[p.action]}</span>
        <b>{p.name}</b>
        <span className="muted small stat">{added > 0 && <span className="plus">+{added}</span>} {removed > 0 && <span className="minus">−{removed}</span>}</span>
      </header>
      <p className="reason">{p.reason}</p>
      <details open={p.action !== "create" || added < 12}>
        <summary>Show the change</summary>
        <DiffView diff={p.diff} />
      </details>
      {problem && <p className="problem" role="alert">{problem}</p>}
      <div className="actions">
        <button className="primary" disabled={busy} onClick={() => decide(onApply)}>Apply</button>
        <button className="ghost" disabled={busy} onClick={() => decide(onReject)}>Reject</button>
      </div>
    </article>
  );
}
// endregion: card
