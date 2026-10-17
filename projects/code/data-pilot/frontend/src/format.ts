import type { Cell } from "./types";

// region: format
/** 211881 -> "2,11,881": the Indian way of grouping digits (the last three, then pairs). */
export function indian(n: number): string {
  const [whole, fraction] = Math.abs(n).toFixed(Math.abs(n) % 1 ? 2 : 0).split(".");
  const head = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return (n < 0 ? "-" : "") + (head ? head + "," : "") + whole.slice(-3) + (fraction ? "." + fraction : "");
}

const MONEY = /(revenue|price|value|amount|total|spend|sales)/i;

/** Show a cell the way a person expects: money with a rupee sign and Indian grouping, other numbers plainly. */
export function formatCell(value: Cell, column: string): string {
  if (value === null) return "—";
  if (typeof value !== "number") return String(value);
  return MONEY.test(column) && !/pct|percent|rate/i.test(column) ? "₹" + indian(value) : Number.isInteger(value) ? indian(value) : String(value);
}

export function toCsv(columns: string[], rows: Cell[][]): string {
  const esc = (v: Cell) => (v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [columns.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

/** Sort rows by one column. Numbers sort as numbers, text as text, empty cells always last. */
export function sortRows(rows: Cell[][], column: number, direction: "asc" | "desc"): Cell[][] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[column], y = b[column];
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sign;
  });
}
// endregion: format
