import { highlightTerms } from "../highlight";
import type { Source } from "../types";

interface Props {
  source: Source;
  query: string;
  cited: boolean;
  flash: boolean;
  details: boolean;
  onOpen: (chunkId: number) => void;
}

export function SourceCard({ source: s, query, cited, flash, details, onOpen }: Props) {
  return (
    <article className={`source ${cited ? "cited" : ""} ${flash ? "flash" : ""}`} id={`source-${s.n}`}>
      <header>
        <span className="num">{s.n}</span>
        <b>{s.document}</b>
        <span className="muted">page {s.page}{s.heading ? ` · ${s.heading}` : ""}</span>
        {cited && <span className="tag">cited</span>}
      </header>
      <p className="snippet">
        {highlightTerms(s.text, query).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
      </p>
      {details && (
        <p className="scores" title="Where this passage ranked in each search, and its raw score">
          <span>vector {s.vector_rank ? `#${s.vector_rank} (${s.vector_score})` : "not in top 20"}</span>
          <span>keyword {s.keyword_rank ? `#${s.keyword_rank} (${s.keyword_score})` : "no match"}</span>
          <span>fused {s.score}</span>
        </p>
      )}
      <button className="link" onClick={() => onOpen(s.chunk_id)}>Open in context</button>
    </article>
  );
}
