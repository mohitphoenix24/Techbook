import { useState } from "react";
import { splitCitations } from "../citations";
import { inr } from "../format";
import type { Draft, Status } from "../types";
import { Checks } from "./Checks";

const ACTION_TEXT: Record<string, string> = { refund: "Refund", cancel: "Cancel the order", deny: "No refund", info: "Information only", investigate: "Investigate" };

// region: draft
export function DraftPanel({ draft, status, actions, busy, onEdit, onApprove, onReject, onSend }: {
  draft: Draft; status: Status; actions: string[]; busy: boolean;
  onEdit: (text: string) => Promise<void>; onApprove: () => void; onReject: (reason: string) => void; onSend: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.text);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const can = (a: string) => actions.includes(a);
  const blocked = draft.checks.some((c) => !c.ok && c.severity === "block");
  const policy = draft.policy;

  return (
    <section className="draft" aria-label="Draft reply">
      <header>
        <h3>Draft reply <span className="muted small">version {draft.version} · {draft.source === "human" ? `edited by ${draft.author}` : "written by the copilot"}</span></h3>
        <p className="policy">
          <b>Policy:</b> {ACTION_TEXT[policy.action] ?? policy.action}{policy.amount ? ` ${inr(policy.amount)}` : ""} <span className="muted">· {policy.reason}</span>
          {policy.needs_lead && <span className="badge needs_lead">Team lead must approve</span>}
        </p>
      </header>

      {editing ? (
        <div className="editor">
          <textarea value={text} rows={9} aria-label="Edit the draft" onChange={(e) => setText(e.target.value)} />
          <div className="row-buttons">
            <button className="primary" disabled={busy || text.trim().length < 10} onClick={async () => { await onEdit(text); setEditing(false); }}>Save and re-check</button>
            <button onClick={() => { setText(draft.text); setEditing(false); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <p className="text" data-testid="draft-text">
          {splitCitations(draft.text, draft.sources).map((p, i) => p.kind === "text"
            ? <span key={i}>{p.text}</span>
            : <span key={i} className={`cite ${p.valid ? "" : "bad"}`} title={p.valid ? `Help article: ${p.id}` : "This article was not provided to the model"}>{p.id}</span>)}
        </p>
      )}

      <Checks checks={draft.checks} />

      {status === "needs_lead" && !can("approve") && !blocked && <p className="note" role="status">This refund is above the limit. A team lead has to approve it.</p>}
      {blocked && <p className="note" role="status">A guardrail check is failing. Edit the draft until it passes, then you can approve it.</p>}

      {rejecting ? (
        <div className="row-buttons">
          <input value={reason} placeholder="Why? (for the audit log)" aria-label="Reason for rejecting" onChange={(e) => setReason(e.target.value)} />
          <button disabled={busy || reason.trim().length < 3} onClick={() => { onReject(reason.trim()); setRejecting(false); setReason(""); }}>Reject draft</button>
          <button onClick={() => setRejecting(false)}>Cancel</button>
        </div>
      ) : (
        <div className="row-buttons">
          {can("edit") && !editing && <button disabled={busy} onClick={() => { setText(draft.text); setEditing(true); }}>Edit</button>}
          {can("approve") && <button className="primary" disabled={busy || editing} onClick={onApprove}>Approve</button>}
          {can("send") && <button className="primary" disabled={busy} onClick={onSend}>Send to customer</button>}
          {can("reject") && !editing && <button disabled={busy} onClick={() => setRejecting(true)}>Reject</button>}
        </div>
      )}
    </section>
  );
}
// endregion: draft
