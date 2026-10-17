// region: ranges
export type Range = [number, number];

/** Merge overlapping or touching line ranges: [[3,8],[6,10],[20,22]] -> [[3,10],[20,22]]. */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: Range[] = [];
  for (const [start, end] of sorted) {
    const last = out[out.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}

export const inRanges = (line: number, ranges: Range[]) => ranges.some(([a, b]) => line >= a && line <= b);

/** Keep a range inside a file of `total` lines (a model may cite lines that do not exist). */
export function clampRange(start: number, end: number, total: number): Range | null {
  if (total < 1 || start > total || end < 1) return null;
  return [Math.max(1, start), Math.min(total, Math.max(start, end))];
}
// endregion: ranges
