import { useEffect, useRef } from "react";
import type { Evidence } from "../types";

interface Span { start: number; end: number; path: string }

// region: segments
/** Cut the text into plain pieces and highlighted pieces. Overlapping spans are dropped: the first one wins. */
export function segments(text: string, evidence: Record<string, Evidence>): { text: string; path?: string }[] {
  const spans: Span[] = Object.entries(evidence)
    .filter(([, e]) => e.status === "found" && e.start !== null && e.end !== null)
    .map(([path, e]) => ({ start: e.start!, end: e.end!, path }))
    .sort((a, b) => a.start - b.start);

  const out: { text: string; path?: string }[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    if (span.start > cursor) out.push({ text: text.slice(cursor, span.start) });
    out.push({ text: text.slice(span.start, span.end), path: span.path });
    cursor = span.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}
// endregion: segments

export function Highlighted({ text, evidence, focusPath }: { text: string; evidence: Record<string, Evidence>; focusPath: string | null }) {
  const focused = useRef<HTMLElement | null>(null);
  useEffect(() => { focused.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [focusPath]);

  return (
    <pre className="source evidence">
      {segments(text, evidence).map((s, i) =>
        s.path ? (
          <mark key={i} className={s.path === focusPath ? "focus" : ""} ref={s.path === focusPath ? (el) => { focused.current = el; } : undefined} title={s.path}>{s.text}</mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </pre>
  );
}
