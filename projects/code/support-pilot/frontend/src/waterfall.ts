import type { Span } from "./types";

// region: layout
export interface Row {
  span: Span;
  depth: number;
  left: number;        // where the bar starts, as a percentage of the whole trace
  width: number;       // how wide it is, as a percentage (never so thin it disappears)
}

/** Lay spans out as a waterfall: one row per span, indented by how deeply it is nested, positioned by time. */
export function layout(spans: Span[], minWidth = 0.8): Row[] {
  const total = Math.max(...spans.map((s) => s.start_ms + s.duration_ms), 1);
  const byId = new Map(spans.map((s) => [s.id, s]));
  const depthOf = (s: Span): number => (s.parent === null || !byId.has(s.parent) ? 0 : 1 + depthOf(byId.get(s.parent)!));
  return [...spans]
    .sort((a, b) => a.start_ms - b.start_ms || a.id - b.id)
    .map((span) => ({
      span,
      depth: depthOf(span),
      left: (span.start_ms / total) * 100,
      width: Math.max((span.duration_ms / total) * 100, minWidth),
    }));
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
// endregion: layout
