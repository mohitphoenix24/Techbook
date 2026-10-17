import type { CitationItem, CitationStatus } from "./types";

// region: citations
export type Part =
  | { kind: "text"; text: string }
  | { kind: "cite"; path: string; start: number; end: number; status: CitationStatus | "unchecked" };

const CITATION = /\[([\w./-]+):(\d+)(?:-(\d+))?\]/g;

/** Cut an answer into plain text and [path:start-end] citations, each carrying the server's verdict on it (or "unchecked" while it streams). */
export function splitCitations(text: string, checked: CitationItem[] | null): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of text.matchAll(CITATION)) {
    if (m.index! > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    const start = Number(m[2]);
    const end = Number(m[3] ?? m[2]);
    const verdict = checked?.find((c) => c.path === m[1] && c.start === start && c.end === end)?.status;
    parts.push({ kind: "cite", path: m[1], start, end, status: verdict ?? "unchecked" });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

export const label = (c: { path: string; start: number; end: number }) => `${c.path.split("/").pop()}:${c.start}${c.end !== c.start ? `-${c.end}` : ""}`;
// endregion: citations
