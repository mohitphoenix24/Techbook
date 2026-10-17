import { KIND_LABEL, share } from "../format";
import type { Hit } from "../types";

// region: retrieval
/** What the model was shown, and why: the evidence behind an answer, one click away. */
export function RetrievalPanel({ hits, terms, onOpen }: { hits: Hit[]; terms: string[]; onOpen: (path: string, start: number, end: number) => void }) {
  const best = Math.max(...hits.map((h) => h.score), 0);
  return (
    <details className="retrieval">
      <summary>What I looked at · {hits.length} piece{hits.length === 1 ? "" : "s"} of code</summary>
      {terms.length > 0 && <p className="small muted">Words searched for: {terms.map((t) => <code key={t}>{t}</code>)}</p>}
      <ol>
        {hits.map((h, i) => (
          <li key={`${h.path}:${h.start}`} className={h.expanded ? "expanded" : ""}>
            <button className="hit" onClick={() => onOpen(h.path, h.start, h.end)}>
              <span className="rank">{i + 1}</span>
              <span className="what"><b>{h.name || h.path}</b> <span className="badge">{KIND_LABEL[h.kind] ?? h.kind}</span>{h.expanded && <span className="badge graph">from the call graph</span>}</span>
              <span className="where muted small">{h.path}:{h.start}-{h.end}</span>
              <span className="bar" aria-hidden><span style={{ width: `${share(h.score, best)}%` }} /></span>
              <span className="why small muted">{h.reasons.join(" · ")} · score {h.score.toFixed(1)}</span>
            </button>
          </li>
        ))}
      </ol>
    </details>
  );
}
// endregion: retrieval
