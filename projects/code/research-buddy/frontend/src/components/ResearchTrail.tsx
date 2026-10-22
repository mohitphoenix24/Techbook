import type { Exchange } from "../chatReducer";
import { domainOf, plural, safeHref } from "../format";

// region: trail
/** What the agent did, in order: each search with the pages it returned, and each calculation. */
export function ResearchTrail({ x }: { x: Exchange }) {
  return (
    <ol className="trail">
      {x.searches.map((s) => (
        <li key={s.id} className={`step ${s.state === "running" ? "running" : s.state === "ok" ? "ok" : "failed"}`}>
          <div className="head">
            <span className="dot" aria-hidden />
            <b>Searched the web</b>
            <q>{s.query}</q>
            <span className="status">{s.state === "running" ? "searching…" : s.state === "failed" ? "failed" : plural(s.results.length, "page")}</span>
          </div>
          {s.error && <p className="problem" role="alert">{s.error}</p>}
          {s.results.length > 0 && (
            <details>
              <summary>Pages found</summary>
              <ul className="pages">
                {s.results.map((p) => {
                  const href = safeHref(p.url);
                  return <li key={p.url}>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{p.title}</a> : p.title} <span className="domain">{domainOf(p.url)}{p.age ? ` · ${p.age}` : ""}</span></li>;
                })}
              </ul>
            </details>
          )}
        </li>
      ))}
      {x.calcs.map((c) => (
        <li key={c.id} className={`step ${c.result === null ? "running" : c.result.ok ? "ok" : "failed"}`}>
          <div className="head">
            <span className="dot" aria-hidden />
            <b>Calculated</b>
            <code>{c.expression}</code>
            <span className="status">{c.result === null ? "running…" : c.result.summary}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
// endregion: trail
