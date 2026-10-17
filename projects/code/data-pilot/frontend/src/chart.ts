// The geometry of charts, as pure functions: numbers in, coordinates out. The React component only draws what these return.

// region: scale
/** Round a maximum up to a "nice" number (1, 2, 5 times a power of ten), so the axis ends on a tidy value. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  const f = max / power;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power;
}

export function ticks(max: number, count = 4): number[] {
  const top = niceMax(max);
  return Array.from({ length: count + 1 }, (_, i) => (top / count) * i);
}

/** 1250000 -> "12.5L", 25000000 -> "2.5Cr": how Indian charts abbreviate (lakh and crore). */
export function compact(n: number): string {
  const trim = (v: number) => v.toFixed(1).replace(/\.0$/, "");
  const a = Math.abs(n);
  return a >= 1e7 ? `${trim(n / 1e7)}Cr` : a >= 1e5 ? `${trim(n / 1e5)}L` : a >= 1e3 ? `${trim(n / 1e3)}k` : trim(n);
}
// endregion: scale

export interface Box { width: number; height: number; left: number; right: number; top: number; bottom: number }

// region: bars-lines
export function bars(values: number[], box: Box, max = Math.max(...values, 0)) {
  const top = niceMax(max);
  const inner = { w: box.width - box.left - box.right, h: box.height - box.top - box.bottom };
  const slot = inner.w / Math.max(values.length, 1);
  return values.map((v, i) => {
    const h = (Math.max(v, 0) / top) * inner.h;
    return { x: box.left + slot * i + slot * 0.15, y: box.top + inner.h - h, w: slot * 0.7, h };
  });
}

export function linePoints(values: number[], box: Box, max = Math.max(...values, 0)) {
  const top = niceMax(max);
  const inner = { w: box.width - box.left - box.right, h: box.height - box.top - box.bottom };
  const step = values.length > 1 ? inner.w / (values.length - 1) : 0;
  return values.map((v, i) => ({ x: box.left + step * i + (values.length === 1 ? inner.w / 2 : 0), y: box.top + inner.h - (Math.max(v, 0) / top) * inner.h }));
}

export const pathOf = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
// endregion: bars-lines

// region: pie
/** Slices as fractions of the whole. More than `max` slices: the smallest are merged into "Other". */
export function slices(points: [string, number][], max = 7): { label: string; value: number; fraction: number }[] {
  const sorted = [...points].filter((p) => p[1] > 0).sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, max);
  const rest = sorted.slice(max).reduce((s, p) => s + p[1], 0);
  const all = rest > 0 ? [...head, ["Other", rest] as [string, number]] : head;
  const total = all.reduce((s, p) => s + p[1], 0) || 1;
  return all.map(([label, value]) => ({ label, value, fraction: value / total }));
}

/** An SVG path for one pie slice, starting at 12 o'clock. */
export function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  if (to - from >= 0.9999) return `M${cx} ${cy - r} A${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;     // a full circle
  const a = (f: number) => [cx + r * Math.sin(f * 2 * Math.PI), cy - r * Math.cos(f * 2 * Math.PI)];
  const [x1, y1] = a(from), [x2, y2] = a(to);
  return `M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}
// endregion: pie
