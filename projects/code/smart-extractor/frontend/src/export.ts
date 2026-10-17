import type { Data } from "./types";

// region: csv
const escape = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Data -> CSV. If the data has a list of objects (invoice line items, action items) each item becomes a row and the
 * single values are repeated on every row, which is what a spreadsheet wants. Otherwise there is one row.
 */
export function toCsv(data: Data): string {
  const listKey = Object.keys(data).find((k) => Array.isArray(data[k]) && (data[k] as unknown[]).some((x) => typeof x === "object" && x !== null));
  const singles = Object.entries(data).filter(([k, v]) => k !== listKey && !Array.isArray(v));
  const flat = (v: unknown) => (Array.isArray(v) ? v.join("; ") : v);

  if (!listKey) {
    const all = Object.entries(data);
    return [all.map(([k]) => escape(k)).join(","), all.map(([, v]) => escape(flat(v))).join(",")].join("\n");
  }
  const items = data[listKey] as Record<string, unknown>[];
  const itemKeys = [...new Set(items.flatMap((i) => Object.keys(i)))];
  const header = [...singles.map(([k]) => k), ...itemKeys.map((k) => `${listKey}.${k}`)];
  const rows = items.map((item) => [...singles.map(([, v]) => v), ...itemKeys.map((k) => item[k])].map(escape).join(","));
  return [header.map(escape).join(","), ...rows].join("\n");
}
// endregion: csv

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
