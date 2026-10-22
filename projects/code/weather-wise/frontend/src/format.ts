import type { Day } from "./types";

// region: range-bars
export interface Bar { left: number; width: number }

/** Where each day's temperature range sits between the coldest and the warmest point of the whole forecast, as percentages.
 *  A day with no data gets null. Even a day with no spread gets a thin bar so it can still be seen. */
export function rangeBars(days: Day[]): (Bar | null)[] {
  const lows = days.map((d) => d.temp_min).filter((v): v is number => v !== null);
  const highs = days.map((d) => d.temp_max).filter((v): v is number => v !== null);
  if (!lows.length || !highs.length) return days.map(() => null);
  const lo = Math.min(...lows), hi = Math.max(...highs), span = Math.max(hi - lo, 1);
  return days.map((d) => {
    if (d.temp_min === null || d.temp_max === null) return null;
    const width = Math.max(((d.temp_max - d.temp_min) / span) * 100, 4);
    return { left: Math.min(((d.temp_min - lo) / span) * 100, 100 - width), width };
  });
}
// endregion: range-bars

// region: labels
export function degrees(v: number | null): string {
  return v === null ? "–" : `${Math.round(v)}°`;
}

/** "29%" with a plain word for the colour of the bar: unlikely, possible or likely. */
export function rainLevel(chance: number | null): "none" | "low" | "mid" | "high" {
  if (chance === null || chance < 10) return "none";
  if (chance < 40) return "low";
  return chance < 70 ? "mid" : "high";
}

/** "2026-10-23" -> "23 Oct". Done by hand, in UTC, so the browser's time zone cannot move the date. */
export function shortDate(iso: string): string {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
// endregion: labels

export const STEP_LABEL: Record<string, string> = { find_place: "Looked up a place", get_forecast: "Got a forecast" };

export function describeInput(name: string, input: Record<string, unknown>): string {
  if (name === "find_place") return [input.name, input.country_code].filter(Boolean).join(", ");
  if (name === "get_forecast") return `${String(input.days ?? 3)} days`;
  return "";
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
