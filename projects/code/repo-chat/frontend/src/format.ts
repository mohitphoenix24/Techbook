// region: format
export const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`);

export const KIND_LABEL: Record<string, string> = { function: "function", method: "method", class: "class", module: "module", doc: "doc", code: "code", file: "file" };

/** A relevance bar needs a width: scores are not capped, so show each as a share of the best one. */
export function share(score: number, best: number): number {
  return best > 0 ? Math.max(4, Math.round((score / best) * 100)) : 0;
}
// endregion: format
