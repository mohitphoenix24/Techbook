import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Turn } from "../askReducer";
import { linkCitations, parseCiteHref } from "../citations";

// region: answer
export function Answer({ turn, onCite }: { turn: Turn; onCite: (n: number) => void }) {
  const components: Components = {
    // A link to "#cite-3" is not a link: it is a button that jumps to source 3.
    a({ href, children }) {
      const cite = parseCiteHref(href);
      if (cite === null) return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
      if (cite === "bad") return <span className="cite bad" title="The model cited a source that does not exist">{children}</span>;
      return <button className="cite" onClick={() => onCite(cite)} title={`Show source ${cite}`}>{cite}</button>;
    },
  };
  const text = linkCitations(turn.answer, turn.sources.length);

  return (
    <div className={`answer ${turn.citations?.refused ? "refused" : ""}`}>
      {turn.status === "searching" && <span className="muted">Searching your documents…</span>}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{text}</ReactMarkdown>
      {turn.status === "streaming" && turn.answer && <span className="caret" aria-hidden />}

      {turn.citations?.uncited && <p className="flag warn">⚠ This answer cites no source. Treat it with care.</p>}
      {!!turn.citations?.invalid.length && <p className="flag warn">⚠ It cites source {turn.citations.invalid.join(", ")}, which was not provided.</p>}
      {turn.status === "stopped" && <p className="flag">⏹ Stopped. This is a partial answer.</p>}
      {turn.status === "error" && <p className="flag error" role="alert">⚠ {turn.error}</p>}
    </div>
  );
}
// endregion: answer
