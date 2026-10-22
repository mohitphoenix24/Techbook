import { diffLines } from "../format";

/** A diff as coloured lines. Text goes in as text nodes, never as HTML, so a note can say anything. */
export function DiffView({ diff }: { diff: string }) {
  const lines = diffLines(diff);
  if (lines.length === 0) return <p className="muted small">No difference.</p>;
  return (
    <pre className="diff" aria-label="Changes">
      {lines.map((l, i) => (
        <div key={i} className={`dl ${l.kind}`}>
          <span className="sign" aria-hidden>{l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}</span>
          <span className="txt">{l.kind === "hunk" || l.kind === "meta" ? l.text : l.text || " "}</span>
        </div>
      ))}
    </pre>
  );
}
