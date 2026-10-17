import { arc, bars, compact, linePoints, pathOf, slices, ticks, niceMax } from "../chart";
import type { ChartData } from "../types";

const BOX = { width: 560, height: 280, left: 52, right: 12, top: 14, bottom: 52 };
const COLOURS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)", "var(--c7)", "var(--c8)"];
const short = (s: string, n = 11) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// region: chart
export function Chart({ data }: { data: ChartData }) {
  const values = data.points.map((p) => p[1]);
  const max = Math.max(...values, 0);
  const top = niceMax(max);
  const plotH = BOX.height - BOX.top - BOX.bottom;

  return (
    <figure className="chart">
      <figcaption>{data.title}</figcaption>
      {data.kind === "pie" ? <Pie data={data} /> : (
        <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} role="img" aria-label={`${data.kind} chart: ${data.title}`}>
          {ticks(max).map((t) => {
            const y = BOX.top + plotH - (t / top) * plotH;
            return <g key={t}><line x1={BOX.left} x2={BOX.width - BOX.right} y1={y} y2={y} className="grid" /><text x={BOX.left - 6} y={y + 4} textAnchor="end" className="axis">{compact(t)}</text></g>;
          })}
          {data.kind === "bar" ? bars(values, BOX, max).map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3} fill="var(--c1)"><title>{`${data.points[i][0]}: ${data.points[i][1]}`}</title></rect>
              <text x={b.x + b.w / 2} y={BOX.height - BOX.bottom + 16} textAnchor="middle" className="axis" transform={data.points.length > 6 ? `rotate(35 ${b.x + b.w / 2} ${BOX.height - BOX.bottom + 16})` : undefined}>{short(data.points[i][0])}</text>
            </g>
          )) : (() => {
            const pts = linePoints(values, BOX, max);
            return (
              <g>
                <path d={pathOf(pts)} fill="none" stroke="var(--c1)" strokeWidth={2.5} strokeLinejoin="round" />
                {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="var(--c1)"><title>{`${data.points[i][0]}: ${data.points[i][1]}`}</title></circle>)}
                {pts.map((p, i) => (i % Math.ceil(pts.length / 6) === 0 ? <text key={i} x={p.x} y={BOX.height - BOX.bottom + 18} textAnchor="middle" className="axis">{short(data.points[i][0], 8)}</text> : null))}
              </g>
            );
          })()}
        </svg>
      )}
      {data.clipped && <p className="meta">Showing the first {data.points.length} points.</p>}
    </figure>
  );
}

function Pie({ data }: { data: ChartData }) {
  const parts = slices(data.points);
  let at = 0;
  return (
    <div className="pie">
      <svg viewBox="0 0 200 200" role="img" aria-label={`pie chart: ${data.title}`}>
        {parts.map((p, i) => {
          const from = at;
          at += p.fraction;
          return <path key={p.label} d={arc(100, 100, 90, from, at)} fill={COLOURS[i % COLOURS.length]} stroke="var(--bg)" strokeWidth={2}><title>{`${p.label}: ${p.value}`}</title></path>;
        })}
      </svg>
      <ul>
        {parts.map((p, i) => <li key={p.label}><i style={{ background: COLOURS[i % COLOURS.length] }} />{p.label} <span className="muted">{(p.fraction * 100).toFixed(0)}%</span></li>)}
      </ul>
    </div>
  );
}
// endregion: chart
