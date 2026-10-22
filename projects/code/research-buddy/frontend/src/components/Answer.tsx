import { answerParts, domainOf, safeHref } from "../format";
import type { Source } from "../types";

// region: answer
/** The answer with its citation markers drawn as small numbered links to the sources below. */
export function Answer({ text, sources }: { text: string; sources: Source[] }) {
  return (
    <p className="answer">
      {answerParts(text || "I could not find an answer.", sources.length).map((p, i) =>
        p.kind === "cite" ? <sup key={i}><a href={`#src-${p.n}`} title={sources[p.n - 1].title}>{p.n}</a></sup>
        : p.kind === "bold" ? <b key={i}>{p.text}</b> : p.text)}
    </p>
  );
}

export function Sources({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <section className="sources" aria-label="Sources">
      <h3>Sources</h3>
      <ol>
        {sources.map((s) => {
          const href = safeHref(s.url);                                    // a link only if it is an http(s) address
          return (
            <li key={s.n} id={`src-${s.n}`}>
              {href ? <a href={href} target="_blank" rel="noopener noreferrer">{s.title}</a> : <span>{s.title}</span>}
              <span className="domain">{domainOf(s.url)}</span>
              {s.quote && <q className="quote">{s.quote}</q>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
// endregion: answer
