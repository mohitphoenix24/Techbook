// region: citations
export type Part = { kind: "text"; text: string } | { kind: "cite"; id: string; valid: boolean };

const CITE = /\[kb:([a-z0-9-]+)\]/g;

/** Cut a draft into plain text and citation markers, so each [kb:article] can be drawn as a chip. */
export function splitCitations(text: string, validIds: string[]): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of text.matchAll(CITE)) {
    if (m.index! > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    parts.push({ kind: "cite", id: m[1], valid: validIds.includes(m[1]) });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}
// endregion: citations
