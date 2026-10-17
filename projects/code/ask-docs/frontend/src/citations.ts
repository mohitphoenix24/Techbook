// Turning "[1]" in the model's answer into something a person can click.

// region: link
/**
 * Replace each [n] with a Markdown link to "#cite-n", which the Answer component draws as a button.
 * A number with no matching source becomes "#cite-bad": the model cited something that does not exist.
 */
export function linkCitations(text: string, sourceCount: number): string {
  return text.replace(/\[(\d+)\]/g, (_, n: string) => {
    const num = Number(n);
    return num >= 1 && num <= sourceCount ? `[${n}](#cite-${n})` : `[${n}](#cite-bad)`;
  });
}

/** "#cite-3" -> 3, "#cite-bad" -> "bad", anything else -> null */
export function parseCiteHref(href: string | undefined): number | "bad" | null {
  const m = /^#cite-(\d+|bad)$/.exec(href ?? "");
  if (!m) return null;
  return m[1] === "bad" ? "bad" : Number(m[1]);
}
// endregion: link
