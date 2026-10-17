// A tiny SQL tokenizer for colouring queries. It does not parse SQL; it only needs to tell words from strings and numbers.

// region: tokens
export type Kind = "keyword" | "string" | "number" | "comment" | "plain";

const KEYWORDS = new Set(("select from where group by order having limit offset join left right inner outer on as and or not in is null like between case when then else end "
  + "distinct union all with desc asc count sum avg min max round substr coalesce cast over partition").split(" "));

const TOKEN = /(--[^\n]*)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z_0-9]*)|(\s+)|(.)/g;

export function tokenize(sql: string): { text: string; kind: Kind }[] {
  const out: { text: string; kind: Kind }[] = [];
  for (const m of sql.matchAll(TOKEN)) {
    const kind: Kind = m[1] ? "comment" : m[2] ? "string" : m[3] ? "number" : m[4] && KEYWORDS.has(m[4].toLowerCase()) ? "keyword" : "plain";
    const last = out[out.length - 1];
    if (last && last.kind === kind && kind === "plain") last.text += m[0];       // merge neighbouring plain text
    else out.push({ text: m[0], kind });
  }
  return out;
}
// endregion: tokens
