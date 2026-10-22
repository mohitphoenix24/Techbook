// region: links
/** A web page's address, made safe to put in an href. Only http and https links are allowed: a page the search returned
 *  could carry `javascript:` or `data:` and run code when clicked. Anything else comes back as null (show the text, not a link). */
export function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
// endregion: links

// region: answer
export type AnswerPart = { kind: "text" | "bold"; text: string } | { kind: "cite"; n: number };

/** The answer is plain text with **bold** and [1] [2] citation markers. Split it into parts so React can draw each as an element:
 *  no HTML is ever built from the model's text, so there is nothing to inject. A marker only counts if that source exists. */
export function answerParts(text: string, sourceCount: number): AnswerPart[] {
  const parts: AnswerPart[] = [];
  for (const piece of text.split(/(\*\*[^*]+\*\*|\[\d{1,2}\])/)) {
    if (!piece) continue;
    const cite = /^\[(\d{1,2})\]$/.exec(piece);
    if (cite && Number(cite[1]) >= 1 && Number(cite[1]) <= sourceCount) parts.push({ kind: "cite", n: Number(cite[1]) });
    else if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4) parts.push({ kind: "bold", text: piece.slice(2, -2) });
    else parts.push({ kind: "text", text: piece });
  }
  return parts;
}
// endregion: answer

export function money(usd: number): string {
  return usd < 0.1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
