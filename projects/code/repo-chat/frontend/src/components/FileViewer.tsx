import { useEffect, useRef, useState } from "react";
import { ApiError, getFile } from "../api";
import { inRanges, mergeRanges, type Range } from "../ranges";

// region: viewer
export function FileViewer({ repoId, path, ranges, onClose }: { repoId: string; path: string | null; ranges: Range[]; onClose: () => void }) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLines(null);
    setError(null);
    if (!path) return;
    getFile(repoId, path).then((f) => setLines(f.lines)).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the file."));
  }, [repoId, path]);

  const marked = mergeRanges(ranges);
  const firstLine = marked[0]?.[0];
  useEffect(() => { if (lines) first.current?.scrollIntoView({ block: "center" }); }, [lines, firstLine, path]);        // bring the cited lines into view

  if (!path) return <p className="muted empty">Click a file, or a citation in an answer, to read the code.</p>;
  return (
    <section className="viewer" aria-label={`File ${path}`}>
      <header><b>{path}</b>{marked.length > 0 && <span className="muted small"> · lines {marked.map(([a, b]) => (a === b ? a : `${a}-${b}`)).join(", ")} highlighted</span>}<button className="link" onClick={onClose}>Close</button></header>
      {error && <p className="problem" role="alert">{error}</p>}
      {!lines && !error && <p className="muted">Loading…</p>}
      {lines && (
        <pre className="code" data-testid="code">
          {lines.map((text, i) => {
            const n = i + 1;
            const hot = inRanges(n, marked);
            return <div key={n} ref={n === firstLine ? first : undefined} className={`line ${hot ? "hot" : ""}`} data-line={n} data-hot={hot}><span className="no">{n}</span><span className="src">{text || " "}</span></div>;
          })}
        </pre>
      )}
    </section>
  );
}
// endregion: viewer
