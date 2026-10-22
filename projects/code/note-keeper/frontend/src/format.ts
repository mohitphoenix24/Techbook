// region: diff
export interface DiffLine { kind: "add" | "del" | "ctx" | "hunk" | "meta"; text: string }

/** A unified diff, line by line, so React can colour each kind. Lines are told apart by their first character:
 *  '+' arrives, '-' goes, ' ' stays, '@@' starts a block of changes, and the first two lines name the files. */
export function diffLines(diff: string): DiffLine[] {
  const lines = diff.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.map((text, i): DiffLine => {
    if (i < 2 && (text.startsWith("--- ") || text.startsWith("+++ "))) return { kind: "meta", text };
    if (text.startsWith("@@")) return { kind: "hunk", text };
    if (text.startsWith("+")) return { kind: "add", text: text.slice(1) };
    if (text.startsWith("-")) return { kind: "del", text: text.slice(1) };
    return { kind: "ctx", text: text.slice(1) };
  });
}

/** How many lines a diff adds and removes. The header lines do not count. */
export function diffStats(diff: string): { added: number; removed: number } {
  const lines = diffLines(diff);
  return { added: lines.filter((l) => l.kind === "add").length, removed: lines.filter((l) => l.kind === "del").length };
}
// endregion: diff

export const ACTION_LABEL: Record<string, string> = { create: "Create", replace: "Replace", append: "Add to", delete: "Delete" };

export const STEP_LABEL: Record<string, string> = {
  list_notes: "Listed the notes",
  read_note: "Read a note",
  search_notes: "Searched the notes",
  propose_change: "Proposed a change",
};

export function describeInput(name: string, input: Record<string, unknown>): string {
  if (name === "read_note") return String(input.name ?? "");
  if (name === "search_notes") return `"${String(input.query ?? "")}"`;
  if (name === "propose_change") return `${String(input.action ?? "")} ${String(input.name ?? "")}`;
  return "";
}

export function formatSize(chars: number): string {
  return chars < 1000 ? `${chars} chars` : `${(chars / 1000).toFixed(1)}k chars`;
}

// region: inline
export type Part = { kind: "text" | "bold" | "code"; text: string };

/** The chat shows plain text with **bold** and `code`. This splits a reply into those parts, so React can draw them
 *  as elements: no HTML is ever built from the model's text, so there is nothing to inject. */
export function inlineParts(text: string): Part[] {
  const parts: Part[] = [];
  for (const piece of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
    if (!piece) continue;
    if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4) parts.push({ kind: "bold", text: piece.slice(2, -2) });
    else if (piece.startsWith("`") && piece.endsWith("`") && piece.length > 2) parts.push({ kind: "code", text: piece.slice(1, -1) });
    else parts.push({ kind: "text", text: piece });
  }
  return parts;
}
// endregion: inline
