---
title: LLM Usage Dashboard
level: advanced
time: 60
icon: chart
cover: #0ea5e9,#6366f1
tags: SVG charts, Suspense, use(), useTransition, data visualisation, tables
summary: An analytics dashboard for an AI product — KPI cards, a hand-built SVG line chart with hover tooltips, bars by model, a sortable endpoint table, and filters — with data loaded through Suspense and use(), and smooth filter changes with transitions.
---

Every AI team watches the same numbers: **requests, tokens, cost, latency and errors**. In this project you build that dashboard from scratch — including the charts, with plain SVG, so you understand exactly how chart libraries work.

:::flow Data flow
fetchUsage(range) | cached promise
use(promise) | inside Suspense
filter + aggregate | useMemo
KPI cards · charts · table | pure components
range change | startTransition
:::

**You'll practise:** `use()` + Suspense for data, promise caching, `useTransition` to keep old data visible while loading, `useMemo` aggregations, SVG scales and paths, pointer tooltips, and sortable tables.

## Step 1 — Scales: the maths behind every chart

A **scale** maps a data value to a pixel position. A linear scale is just a straight-line formula.

```js run title="Step 1 · linear scales and an SVG path"
function scaleLinear([d0, d1], [r0, r1]) {
  return (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
}

const values = [120, 180, 150, 260, 240, 310];
const x = scaleLinear([0, values.length - 1], [40, 380]);       // index → x pixels
const y = scaleLinear([0, Math.max(...values)], [180, 20]);     // value → y pixels (SVG y grows downward!)

const path = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
console.log("y(0) =", y(0), " y(310) =", y(310));
console.log("path:", path);
```

The `d` attribute of an SVG `<path>`: **M** moves to a point, **L** draws a line to the next one. That's a line chart.

## Step 2 — The complete dashboard

```jsx run title="LLM Usage Dashboard · complete app"
import { Suspense, use, useMemo, useState, useTransition } from "react";

// ============ fake API with deterministic data (seeded random) ============
const MODELS = { "claude-opus-5-5": "#8b5cf6", "claude-sonnet-5-5": "#0ea5e9", "claude-haiku-4-5": "#22c55e" };
const RATES = { "claude-opus-5-5": [5, 25], "claude-sonnet-5-5": [3, 15], "claude-haiku-4-5": [1, 5] };   // example $/M tokens (in, out)
const ENDPOINTS = ["/api/chat", "/api/summarise", "/api/extract", "/api/agent", "/api/search"];

function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

function generate(days) {
  const rand = rng(42);
  const rows = [];
  const today = new Date("2026-10-06");
  for (let d = 89; d >= 0; d--) {
    const date = new Date(today - d * 864e5).toISOString().slice(0, 10);
    const growth = 1 + (89 - d) / 60, weekend = [0, 6].includes(new Date(date).getDay()) ? 0.6 : 1;
    for (const model of Object.keys(MODELS)) for (const endpoint of ENDPOINTS) {
      const base = { "claude-opus-5-5": 40, "claude-sonnet-5-5": 90, "claude-haiku-4-5": 160 }[model];
      const requests = Math.round(base * growth * weekend * (0.5 + rand()) * (endpoint === "/api/chat" ? 2 : 1));
      const inTok = requests * Math.round(800 + rand() * 1500), outTok = requests * Math.round(150 + rand() * 500);
      rows.push({ date, model, endpoint, requests, inTok, outTok,
        errors: Math.round(requests * (endpoint === "/api/agent" ? 0.03 : 0.008) * rand() * 2),
        p95: Math.round(({ "claude-opus-5-5": 4200, "claude-sonnet-5-5": 2600, "claude-haiku-4-5": 900 }[model]) * (0.8 + rand() * 0.5) * (endpoint === "/api/agent" ? 2.2 : 1)) });
    }
  }
  return rows.slice(-days * Object.keys(MODELS).length * ENDPOINTS.length);
}

const cache = new Map();                                    // same range → same promise (required by use())
function fetchUsage(days) {
  if (!cache.has(days)) cache.set(days, new Promise((r) => setTimeout(() => r(generate(days)), 700)));
  return cache.get(days);
}

// ============ helpers ============
const fmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const money = (n) => "$" + n.toLocaleString("en", { maximumFractionDigits: 0 });
const costOf = (r) => (r.inTok * RATES[r.model][0] + r.outTok * RATES[r.model][1]) / 1e6;
const scale = ([d0, d1], [r0, r1]) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);

// ============ components ============
function Kpi({ label, value, sub, tone }) {
  return (
    <div className="card" style={{ flex: "1 1 120px", padding: "10px 12px" }}>
      <small className="muted">{label}</small>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sub && <small style={{ color: tone === "bad" ? "var(--danger)" : tone === "good" ? "var(--ok)" : "var(--muted)" }}>{sub}</small>}
    </div>
  );
}

function LineChart({ series, metric }) {
  const [hoverIndex, setHover] = useState(null);
  const W = 560, H = 200, P = { l: 44, r: 10, t: 10, b: 24 };
  const dates = series[0]?.points.map((p) => p.date) ?? [];
  const hover = hoverIndex !== null && hoverIndex < dates.length ? hoverIndex : null;   // the range may have shrunk
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const x = scale([0, Math.max(1, dates.length - 1)], [P.l, W - P.r]);
  const y = scale([0, max], [H - P.b, P.t]);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);

  function onMove(e) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    setHover(Math.max(0, Math.min(dates.length - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (dates.length - 1)))));
  }

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${metric} per day by model`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--border)" />
            <text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{fmt.format(t)}</text>
          </g>
        ))}
        {dates.map((d, i) => i % Math.ceil(dates.length / 6) === 0 && (
          <text key={d} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{d.slice(5)}</text>
        ))}
        {series.map((s) => (
          <path key={s.model} d={s.points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke={MODELS[s.model]} strokeWidth="2" />
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="var(--muted)" strokeDasharray="3 3" />}
        {hover !== null && series.map((s) => <circle key={s.model} cx={x(hover)} cy={y(s.points[hover].value)} r="3.5" fill={MODELS[s.model]} />)}
      </svg>
      {hover !== null && (
        <div className="card" style={{ position: "absolute", top: 4, left: x(hover) / W > 0.6 ? 50 : "auto", right: x(hover) / W > 0.6 ? "auto" : 8, padding: "6px 10px", fontSize: 12, pointerEvents: "none" }}>
          <b>{dates[hover]}</b>
          {series.map((s) => <div key={s.model} style={{ color: MODELS[s.model] }}>{s.model.replace("claude-", "")}: {fmt.format(s.points[hover].value)}</div>)}
        </div>
      )}
    </div>
  );
}

function Bars({ data }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="stack" style={{ gap: 6 }}>
      {data.map((d) => (
        <div key={d.label}>
          <div className="row" style={{ justifyContent: "space-between", fontSize: 13 }}><span>{d.label}</span><b>{d.display}</b></div>
          <div style={{ height: 8, background: "var(--card)", borderRadius: 4 }}>
            <div style={{ width: `${(d.value / max) * 100}%`, height: "100%", borderRadius: 4, background: d.color, transition: "width .4s" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EndpointTable({ rows }) {
  const [sort, setSort] = useState({ key: "cost", dir: -1 });
  const sorted = [...rows].sort((a, b) => (a[sort.key] > b[sort.key] ? 1 : -1) * sort.dir);
  const cols = [["endpoint", "Endpoint"], ["requests", "Requests"], ["cost", "Cost"], ["errorRate", "Errors"], ["p95", "p95 ms"]];
  return (
    <table>
      <thead><tr>{cols.map(([k, label]) => (
        <th key={k} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
          <button onClick={() => setSort({ key: k, dir: sort.key === k ? -sort.dir : -1 })} style={{ border: 0, background: "none", padding: 0, fontWeight: 700 }}>
            {label} {sort.key === k ? (sort.dir === 1 ? "▲" : "▼") : ""}
          </button>
        </th>))}</tr></thead>
      <tbody>{sorted.map((r) => (
        <tr key={r.endpoint}>
          <td><code>{r.endpoint}</code></td><td>{fmt.format(r.requests)}</td><td>{money(r.cost)}</td>
          <td style={{ color: r.errorRate > 0.01 ? "var(--danger)" : undefined }}>{(r.errorRate * 100).toFixed(2)}%</td><td>{fmt.format(r.p95)}</td>
        </tr>))}</tbody>
    </table>
  );
}

function Dashboard({ usagePromise, models, metric }) {
  const rows = use(usagePromise);                               // suspends until the data arrives
  const view = useMemo(() => {
    const r = rows.filter((x) => models.includes(x.model));
    const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
    const dates = [...new Set(r.map((x) => x.date))];
    const valueOf = { requests: (x) => x.requests, tokens: (x) => x.inTok + x.outTok, cost: costOf }[metric];
    const series = models.map((m) => ({ model: m, points: dates.map((d) => ({ date: d, value: sum(r.filter((x) => x.model === m && x.date === d), valueOf) })) }));
    const half = Math.floor(dates.length / 2);
    const firstHalf = sum(r.filter((x) => x.date < dates[half]), costOf), secondHalf = sum(r.filter((x) => x.date >= dates[half]), costOf);
    const byEndpoint = ENDPOINTS.map((e) => {
      const er = r.filter((x) => x.endpoint === e), req = sum(er, (x) => x.requests);
      return { endpoint: e, requests: req, cost: sum(er, costOf), errorRate: sum(er, (x) => x.errors) / (req || 1), p95: Math.max(0, ...er.map((x) => x.p95)) };
    });
    return {
      requests: sum(r, (x) => x.requests), tokens: sum(r, (x) => x.inTok + x.outTok), cost: sum(r, costOf),
      errorRate: sum(r, (x) => x.errors) / (sum(r, (x) => x.requests) || 1),
      trend: firstHalf ? (secondHalf - firstHalf) / firstHalf : 0, series, byEndpoint,
      byModel: models.map((m) => ({ label: m.replace("claude-", ""), value: sum(r.filter((x) => x.model === m), costOf), color: MODELS[m] })).map((d) => ({ ...d, display: money(d.value) })),
    };
  }, [rows, models, metric]);

  return (
    <div className="stack">
      <div className="row" style={{ alignItems: "stretch" }}>
        <Kpi label="Requests" value={fmt.format(view.requests)} />
        <Kpi label="Tokens" value={fmt.format(view.tokens)} />
        <Kpi label="Cost (example rates)" value={money(view.cost)} sub={`${view.trend >= 0 ? "▲" : "▼"} ${(Math.abs(view.trend) * 100).toFixed(0)}% vs first half`} tone={view.trend > 0.3 ? "bad" : "good"} />
        <Kpi label="Error rate" value={(view.errorRate * 100).toFixed(2) + "%"} tone={view.errorRate > 0.01 ? "bad" : "good"} sub={view.errorRate > 0.01 ? "above 1% target" : "within target"} />
      </div>
      <div className="card" style={{ padding: 10 }}><b style={{ fontSize: 14 }}>{metric[0].toUpperCase() + metric.slice(1)} per day</b><LineChart series={view.series} metric={metric} /></div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="card" style={{ flex: "1 1 180px" }}><b style={{ fontSize: 14 }}>Cost by model</b><div style={{ marginTop: 8 }}><Bars data={view.byModel} /></div></div>
        <div className="card" style={{ flex: "3 1 320px", overflowX: "auto" }}><EndpointTable rows={view.byEndpoint} /></div>
      </div>
    </div>
  );
}

function Skeleton() {
  const block = (h) => <div style={{ height: h, borderRadius: 12, background: "var(--card)", border: "1px solid var(--border)" }} />;
  return <div className="stack" aria-busy="true" aria-label="Loading dashboard"><div className="row">{[1, 2, 3, 4].map((i) => <div key={i} style={{ flex: 1 }}>{block(70)}</div>)}</div>{block(220)}{block(160)}</div>;
}

export default function App() {
  const [days, setDays] = useState(30);
  const [usagePromise, setUsagePromise] = useState(() => fetchUsage(30));
  const [models, setModels] = useState(Object.keys(MODELS));
  const [metric, setMetric] = useState("requests");
  const [isPending, startTransition] = useTransition();

  function changeRange(d) {
    setDays(d);
    startTransition(() => setUsagePromise(fetchUsage(d)));   // keep showing old data while new data loads
  }
  const toggleModel = (m) => setModels((ms) => ms.includes(m) ? (ms.length > 1 ? ms.filter((x) => x !== m) : ms) : [...ms, m]);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>📊 LLM usage {isPending && <small className="muted"> updating…</small>}</b>
        <div className="row" style={{ gap: 4 }}>
          {[7, 30, 90].map((d) => <button key={d} onClick={() => changeRange(d)} aria-pressed={days === d} className={days === d ? "primary" : ""} style={{ padding: "3px 10px" }}>{d}d</button>)}
          <select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Metric"><option value="requests">Requests</option><option value="tokens">Tokens</option><option value="cost">Cost</option></select>
        </div>
      </div>
      <div className="row" style={{ gap: 4 }}>
        {Object.entries(MODELS).map(([m, c]) => (
          <button key={m} onClick={() => toggleModel(m)} aria-pressed={models.includes(m)}
            style={{ padding: "2px 10px", fontSize: 12, borderColor: c, background: models.includes(m) ? c : "transparent", color: models.includes(m) ? "white" : c }}>{m.replace("claude-", "")}</button>
        ))}
      </div>
      <div style={{ opacity: isPending ? 0.6 : 1, transition: "opacity .2s" }}>
        <Suspense fallback={<Skeleton />}>
          <Dashboard usagePromise={usagePromise} models={models} metric={metric} />
        </Suspense>
      </div>
    </div>
  );
}
```

Hover the chart for exact values, switch metrics, toggle models, sort the table, and switch the range: the first load shows a skeleton; later range changes keep the old dashboard (dimmed) until the new data is ready — that's `useTransition` working with Suspense.

## How it works

| Feature | Technique |
|---|---|
| data loading | `use(promise)` inside `<Suspense>`; promises **cached per range** so re-renders don't refetch |
| no flashing on filter change | `startTransition(() => setUsagePromise(...))` keeps the current UI while the next promise resolves |
| aggregations | one `useMemo` turns raw rows into KPIs, series, bars and table rows |
| line chart | linear scales + an SVG `path`; gridlines and labels are just `<line>` and `<text>` |
| tooltip | convert pointer x → data index; draw a guide line and dots; an absolutely positioned card |
| sortable table | sort state `{ key, dir }`; `aria-sort` on headers for screen readers |

:::tip Chart libraries
For production dashboards, **Recharts**, **Visx**, **Nivo** or **ECharts** save time (axes, legends, animation, responsiveness). Knowing the scale + path idea makes all of them easier to customise.
:::

:::exercise Extend it
1. Add a **date-range brush** under the chart (drag to select a window).
2. Add an **anomaly flag**: mark days where cost is more than 2 standard deviations above the 7-day average.
3. Replace `fetchUsage` with a real endpoint and **TanStack Query** (`useSuspenseQuery`).
4. Add an **"✨ Explain this spike"** button that sends the selected day's numbers to a model and shows its explanation.
:::

:::keypoints
- `use(promise)` + Suspense gives clean loading; cache promises so they're stable between renders.
- `useTransition` keeps old data on screen while new data loads — no skeleton flash on every filter change.
- Charts are scales + SVG shapes; tooltips map pointer position back to data.
- Keep raw data raw; derive every number with `useMemo`.
:::
