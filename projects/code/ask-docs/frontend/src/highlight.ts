// Show WHY a passage matched: mark the words of the question inside it.

const SKIP = new Set("the a an of and or to in on for with is are was were be it its you your what how which who many much do does i my me can if at by from this that".split(" "));

// region: highlight
export function queryTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().match(/[a-z0-9₹]+/g) ?? [])].filter((w) => w.length >= 3 && !SKIP.has(w));
}

/** Cut text into pieces, marking those that start with a query word (so "leave" also marks "leaves"). */
export function highlightTerms(text: string, query: string): { text: string; hit: boolean }[] {
  const terms = queryTerms(query).map((t) => t.replace(/(ing|ed|es|s)$/, ""));          // the same light stemming as the server
  const pieces: { text: string; hit: boolean }[] = [];
  for (const part of text.split(/(\b[\p{L}\p{N}']+\b)/u)) {
    if (!part) continue;
    const word = part.toLowerCase();
    pieces.push({ text: part, hit: terms.some((t) => t.length >= 3 && word.startsWith(t)) });
  }
  return pieces;
}
// endregion: highlight
