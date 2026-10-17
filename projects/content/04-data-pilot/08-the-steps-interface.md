---
title: The steps interface
level: intermediate
time: 55
summary: Show the agent's work, not just its answer. A step timeline that folds away, a SQL view with tiny syntax colouring, a sortable table that formats rupees the Indian way, and a hand-drawn SVG chart whose geometry is plain testable functions. The real components render in your browser.
tags: React, components, SVG, charts, accessibility, formatting
---

The model returns an answer; the **interface** decides whether anyone trusts it. For a data agent, trust comes from three things a person can check at a glance: *what did it do* (the steps), *what was asked of the database* (the SQL), and *what came back* (the table and chart). This lesson builds those views from the state of lesson 7.

## One question, four parts

```text title="What one answered question shows"
┌──────────────────────────────────────────────┐
│                       Top 3 customers? (you) │
├──────────────────────────────────────────────┤
│ ▸ How I found this · 5 steps   (folds away)  │
│    ● Looked at a table  orders   5 columns   │
│    ● Ran a query                 3 rows      │
│        SELECT c.name, ... (coloured, Copy)   │
├──────────────────────────────────────────────┤
│ Your top customer is Arjun Kulkarni ...      │  ← the answer
│ [ bar chart ]                                │
│ [ sortable table ]        Download CSV       │
│ ▸ SQL used     3 model calls · 3,410 tokens  │
└──────────────────────────────────────────────┘
```

Everything is derived from the `Turn` object that the reducer built (lesson 7). The components do not know about the network at all.

## The turn

```tsx src="data-pilot/frontend/src/components/TurnView.tsx" region="turn" title="frontend/src/components/TurnView.tsx"
```

Read it for the decisions:

- **The steps live in a native `<details>`.** It is open while the agent works, so you can watch, and folds itself away when the answer is ready (`useEffect` on `turn.status`). A person can still open it again. Native elements give keyboard support and screen-reader semantics for free.
- **The table and chart are found from the steps.** The last *successful* table result is the one to show, and the last chart. A failed query never replaces a good one.
- **"Thinking…"** appears only in the gap when every tool has returned but the model has not started writing. Without it the screen looks frozen between a result and the next word.
- **The caret blinks next to the answer only while it is still arriving.**
- **Failure states are real states**: a stopped run says "Stopped"; an error says what happened, with `role="alert"` so a screen reader announces it.
- **The cost line** (model calls, tokens in and out, dollars) is quiet, but it is there. People should know what a question costs.

## One step

```tsx src="data-pilot/frontend/src/components/StepCard.tsx" region="step" title="frontend/src/components/StepCard.tsx"
```

A step has three visual states from a single field (`result`): `null` is **running** (a pulsing dot), `ok` is green with the summary ("3 rows in 1 ms"), and `failed` is red with the message in an alert. The model's "thinking aloud" note sits above the first step of its turn, in italics. `LABEL` turns tool names into plain English, because `run_sql` means nothing to a shop owner and "Ran a query" does.

:::tip Why show failures at all?
It is tempting to hide the failed attempts and show only the clean path. Don't. Seeing "the first query used a column that does not exist, so it tried again" teaches the reader how the system works, and tells them *why* the answer can be trusted. An agent that hides its stumbles looks magic until the day it is wrong.
:::

## SQL, with colours

A full syntax highlighter is a big library. We only need to tell words from strings and numbers, so a 20-line tokenizer does it:

```ts src="data-pilot/frontend/src/sqlHighlight.ts" region="tokens" title="frontend/src/sqlHighlight.ts"
```

One regular expression with alternatives, tried in order: a comment, a string (with `''` as an escaped quote), a number, a word, spaces, or any single character. `matchAll` walks the query once, and neighbouring plain pieces are merged. It never *parses* SQL, so it can never fail on odd SQL: the worst case is a missed colour.

## Numbers a person expects

```ts src="data-pilot/frontend/src/format.ts" region="format" title="frontend/src/format.ts"
```

The shop is Indian, so **₹2,11,881** (last three digits, then pairs), not 211,881. `formatCell` guesses by column name: columns called `revenue`, `price`, `total`... are money; `rate` or `pct` columns are not. It is a heuristic and an honest one: if it is wrong, the number is still correct, only the decoration is off. `sortRows` sorts numbers as numbers (so 9 comes before 10), text with `localeCompare`, and always puts empty cells last.

## The table

```tsx src="data-pilot/frontend/src/components/ResultTable.tsx" region="table" title="frontend/src/components/ResultTable.tsx"
```

- Clicking a header cycles **ascending, descending, original order**. The header is a real `<button>`, and the `<th>` carries `aria-sort`, so assistive technology knows the sort state.
- `useMemo` re-sorts only when the rows or the sort change.
- "(more were cut off)" repeats the truncation flag from the server: the person is never allowed to think they saw everything when they did not.
- The CSV is built in the browser from the rows already there. No extra request.

## The chart, without a chart library

A chart library would add 100 KB and a learning curve for three simple shapes. Drawing with SVG is easier than it sounds, as long as you keep **geometry** (numbers to coordinates) separate from **drawing** (coordinates to elements). The geometry is plain functions:

```ts src="data-pilot/frontend/src/chart.ts" region="scale" title="frontend/src/chart.ts"
```

```ts src="data-pilot/frontend/src/chart.ts" region="bars-lines" title="frontend/src/chart.ts"
```

```ts src="data-pilot/frontend/src/chart.ts" region="pie" title="frontend/src/chart.ts"
```

- **`niceMax`** rounds the top of the axis up to 1, 2, 5 or 10 times a power of ten, so the axis ends at 50 lakh, not 47.3 lakh.
- **`compact`** abbreviates the Indian way: `12.5L` (lakh), `2.5Cr` (crore).
- **`bars` and `linePoints`** convert values to pixel positions inside a box with margins. The SVG's `viewBox` scales it to any width.
- **`slices`** turns values into fractions, sorts them, and merges the smallest into "Other" when there are more than seven (a pie of fifteen slices is unreadable).
- **`arc`** builds the SVG path of one slice from angles. Pure trigonometry: x is `sin`, y is `-cos`, because we start at twelve o'clock and the y axis points down.

Then the component only maps those coordinates to elements:

```tsx src="data-pilot/frontend/src/components/Chart.tsx" region="chart" title="frontend/src/components/Chart.tsx"
```

Every mark has a `<title>` (the hover tooltip and the accessible name), and the whole chart has `role="img"` with an `aria-label`. Colours come from CSS variables, so dark mode just works.

```ts src="data-pilot/frontend/src/chart.test.ts" title="frontend/src/chart.test.ts"
```

Because the geometry is pure, tests are one-liners: "this maximum rounds up to that", "the biggest bar fills the plot", "a slice that is the whole circle still draws". No browser needed.

## The real components, live

This block runs the project's actual `TurnView` (with `StepCard`, `Sql`, `Chart`, `ResultTable` and every helper above) on four hand-written states. Pick one, then click a table header to sort, or the Copy button on the SQL.

```tsx run src="data-pilot/frontend/src/format.ts,data-pilot/frontend/src/chart.ts,data-pilot/frontend/src/sqlHighlight.ts,data-pilot/frontend/src/agentReducer.ts,data-pilot/frontend/src/components/Sql.tsx,data-pilot/frontend/src/components/ResultTable.tsx,data-pilot/frontend/src/components/Chart.tsx,data-pilot/frontend/src/components/StepCard.tsx,data-pilot/frontend/src/components/TurnView.tsx" flat title="The real TurnView on four states" level=advanced autoclick="Finished"
import { useState } from "react";

const css = `
:root{--panel:var(--card);--bad:var(--danger);--code-bg:#111827;--code-text:#e5e7eb;--kw:#7dd3fc;--str:#86efac;--num:#fcd34d;--com:#9ca3af;--radius:12px;
--c1:#0891b2;--c2:#6366f1;--c3:#f59e0b;--c4:#ec4899;--c5:#22c55e;--c6:#a855f7;--c7:#ef4444;--c8:#94a3b8}
.question{margin-left:auto;width:fit-content;max-width:100%;background:color-mix(in srgb,var(--accent) 14%,var(--bg));border-radius:12px;padding:8px 14px;font-weight:500}
.steps{margin-top:12px;border:1px solid var(--border);border-radius:12px;background:var(--panel)}
.steps summary{padding:8px 14px;cursor:pointer;font-weight:600;font-size:13.5px;color:var(--muted)}
.steps ol{list-style:none;margin:0;padding:0 12px 12px;display:flex;flex-direction:column;gap:8px}
.step{background:var(--bg);border:1px solid var(--border);border-left:4px solid var(--c8);border-radius:10px;padding:8px 12px}
.step.ok{border-left-color:var(--ok)}.step.failed{border-left-color:var(--bad)}.step.running{border-left-color:var(--accent)}
.step .note{margin:0 0 6px;font-style:italic;color:var(--muted);font-size:14px}
.step .head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:14px}.step .status{margin-left:auto;font-size:12.5px;color:var(--muted)}
.step.failed .status,.problem{color:var(--bad)}.step .dot{width:8px;height:8px;border-radius:50%;background:currentColor;color:var(--c8)}
.step.ok .dot{color:var(--ok)}.step.failed .dot{color:var(--bad)}.step.running .dot{color:var(--accent)}
.sql{position:relative;margin-top:8px;background:var(--code-bg);color:var(--code-text);border-radius:10px}
.sql pre{margin:0;padding:10px 62px 10px 14px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12.5px;background:none;border:0}
.sql .copy{position:absolute;top:6px;right:8px;background:rgba(255,255,255,.1);border:0;color:inherit;font-size:12px;padding:2px 8px}
.tk-keyword{color:var(--kw);font-weight:600}.tk-string{color:var(--str)}.tk-number{color:var(--num)}
.answer{margin:14px 0 6px;font-size:16px}.thinking{margin:12px 0}.flag{font-size:13.5px;color:var(--muted)}.flag.error{color:var(--bad)}.usage{font-size:12px}
.table-wrap{overflow:auto;border:1px solid var(--border);border-radius:10px;max-height:240px;margin-top:10px}.table-wrap th button{border:0;background:none;padding:0;font-weight:600}
td.num{text-align:right;font-variant-numeric:tabular-nums}.meta{font-size:12.5px;color:var(--muted);margin:6px 0 0}.link{border:0;background:none;color:var(--accent);padding:0}
.chart{margin:14px 0 0;padding:12px 14px;background:var(--panel);border:1px solid var(--border);border-radius:12px}.chart figcaption{font-weight:600;font-size:14px}
.chart svg{width:100%;height:auto;display:block}.chart .grid{stroke:var(--border)}.chart .axis{fill:var(--muted);font-size:11px}
.pie{display:flex;gap:20px;align-items:center}.pie svg{width:150px}.pie ul{list-style:none;margin:0;padding:0}.pie li i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px}
`;

const table = { type: "table", sql: "", columns: ["name", "city", "revenue"], row_count: 3, truncated: false, ms: 2,
  rows: [["Arjun Kulkarni", "Mumbai", 211881], ["Sofia Nair", "Kochi", 178383], ["Kabir Rao", "Bengaluru", 133259]] } as const;
const chart = { type: "chart", kind: "bar", title: "Top customers by revenue", x: "name", y: "revenue", clipped: false,
  points: [["Arjun K.", 211881], ["Sofia N.", 178383], ["Kabir R.", 133259]] } as const;
const SQL = "SELECT c.name, c.city, ROUND(SUM(i.quantity * i.unit_price)) AS revenue FROM customers c JOIN orders o ON o.customer_id = c.id JOIN order_items i ON i.order_id = o.id WHERE o.status IN ('delivered', 'shipped') GROUP BY c.id ORDER BY revenue DESC LIMIT 3";

const base = { id: "t", question: "Who are the top 3 customers by revenue?", queries: [], usage: null, error: null, texts: {}, turns: 0 };
const describe = { id: "a", turn: 0, name: "describe_table", input: { table: "orders" }, result: { ok: true, summary: "5 columns", ui: { type: "columns", table: "orders", columns: [] } } };
const STATES: Record<string, any> = {
  "Working": { ...base, status: "working", turns: 1, texts: { 0: "Let me look at the tables first." }, steps: [describe, { id: "b", turn: 0, name: "run_sql", input: { query: SQL }, result: null }] },
  "Finished": { ...base, status: "done", turns: 3, queries: [SQL], usage: { input_tokens: 2840, output_tokens: 310, cost_usd: 0.0088 },
    texts: { 0: "Let me look at the tables first.", 2: "Your top customer is Arjun Kulkarni from Mumbai with ₹2,11,881, followed by Sofia Nair and Kabir Rao." },
    steps: [describe, { id: "b", turn: 1, name: "run_sql", input: { query: SQL }, result: { ok: true, summary: "3 rows in 2 ms", ui: { ...table, sql: SQL } } },
            { id: "c", turn: 1, name: "show_chart", input: { kind: "bar", x: "name", y: "revenue" }, result: { ok: true, summary: "bar chart shown", ui: chart } }] },
  "A step failed": { ...base, status: "working", turns: 2, texts: { 0: "I will count orders by state." },
    steps: [{ id: "b", turn: 0, name: "run_sql", input: { query: "SELECT state, COUNT(*) FROM orders GROUP BY state" }, result: { ok: false, summary: "no such column: state Hint: Check table and column names with describe_table.", ui: { type: "error", message: "" } } }] },
  "Stopped by the guard": { ...base, status: "error", error: "I could not finish within 6 steps. Try a narrower question.", turns: 6, steps: [describe] },
};

export default function App() {
  const [which, setWhich] = useState("Working");
  return (
    <div className="stack">
      <style>{css}</style>
      <div className="row">{Object.keys(STATES).map((k) => <button key={k} className={k === which ? "primary" : ""} onClick={() => setWhich(k)}>{k}</button>)}</div>
      <TurnView key={which} turn={STATES[which]} />
    </div>
  );
}
```

Switch between the states and compare: the same component draws a running step, a finished run with chart and table, a failed query that is shown honestly, and a run that hit the step limit. Nothing in the component knows which is which: it only reads the `Turn`.

## Accessibility, quickly

Small choices added up in this interface, and none cost much:

| Choice | Benefit |
|---|---|
| `<details>`/`<summary>` for the step list | keyboard and screen-reader support built in |
| `<button>` in table headers, `aria-sort` | sorting works by keyboard and is announced |
| `role="alert"` on errors | announced when it appears |
| `role="log"` with `aria-live="polite"` on the thread | new content is read without interrupting |
| `role="img"` and `aria-label` on charts, `<title>` on marks | the chart has a text equivalent |
| colour is never the only signal | steps also have a status word, not just a coloured dot |

:::keypoints
- Show the work: steps, SQL and results. Trust comes from being able to check.
- Derive every view from the `Turn` object; components know nothing about the network.
- Fold the steps away when the answer is ready; keep them one click away; show failed attempts honestly.
- A tiny tokenizer is enough for SQL colours; it never parses, so it never breaks.
- Format for the audience: ₹ with Indian grouping, lakh and crore on axes, numbers right-aligned.
- Keep chart geometry in pure functions and the SVG component thin; test the functions.
- Use native elements and ARIA roles so the interface works for everyone.
:::

```quiz
? Why keep chart geometry (bars, arcs, ticks) in separate pure functions?
- SVG requires it
+ They are easy to test without a browser, and the component stays a thin mapping from coordinates to elements
- It makes the chart faster
> Numbers in, coordinates out: unit tests are one line each.
? A query fails and the model then succeeds. What does the interface show?
- Only the successful step
+ Both: the failed step in red with its message, then the successful one
- An error banner for the whole question
> Showing recovery builds trust, and it explains why the final answer can be relied on.
? Why does the table use real buttons in its header cells?
- It looks better
+ Keyboard users can sort and assistive technology can announce the sort state
- Buttons are required inside tables
> Interactive things should be native interactive elements.
```

:::exercise A line chart for months
Ask "Show revenue by month" and look at the chart. Add a hover readout for line charts: when the pointer moves over the SVG, show the nearest point's label and value in the figure caption (use `onPointerMove`, compute the index from the pointer's x position with the same margins `linePoints` uses, and write a pure function for that calculation first, with a test). What changes if there are 365 daily points instead of 12?
:::
