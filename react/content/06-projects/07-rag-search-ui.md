---
title: RAG Search Interface
level: advanced
time: 65
icon: search
cover: #14b8a6,#3b82f6
tags: RAG, BM25, search UX, citations, useDeferredValue, keyboard navigation
summary: The front end of a retrieval-augmented app — instant BM25 search over a knowledge base, highlighted matches, facets with counts, keyboard navigation, and a streamed answer with clickable citations that says "I don't know" when the sources don't cover the question.
---

RAG apps live or die by **trust**: users must see *where* an answer came from. This project builds a search-and-answer interface where every claim links to a source passage — and the system admits when it can't find one.

:::flow Pipeline (all in the browser here)
Query | typed by the user
BM25 ranking | over passages
Facets + highlights | filter & explain
Top passages | → answer with [1][2]
Low score? | "I don't know"
:::

In production, ranking and answering happen on your **backend** (vector search + a model). Here they run in the browser so you can see and change everything. The UI is identical either way.

**You'll practise:** a classic ranking algorithm, `useDeferredValue` for instant search, safe highlighting, facets with counts, keyboard navigation with `aria-activedescendant`, and streaming an answer with citations.

## Step 1 — BM25 ranking in 25 lines

**BM25** is the ranking formula behind most keyword search engines (and half of every "hybrid" RAG system). It rewards passages that contain the query's words — especially **rare** words — without over-rewarding long passages that repeat them.

```js run title="Step 1 · BM25"
const STOP = new Set("a an the is are was of to in on for and or how do does i my can what with it".split(" "));
const tokenize = (s) => s.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, "")) ?? [];

function buildIndex(docs) {
  const toks = docs.map((d) => tokenize(d.text));
  const avgLen = toks.reduce((t, x) => t + x.length, 0) / toks.length;
  const df = {};
  for (const t of toks) for (const w of new Set(t)) df[w] = (df[w] || 0) + 1;
  return { docs, toks, avgLen, df, N: docs.length };
}

function search(index, query, k1 = 1.5, b = 0.75) {
  const q = tokenize(query);
  return index.toks.map((t, i) => {
    let score = 0;
    for (const w of q) {
      const tf = t.filter((x) => x === w).length;
      if (!tf) continue;
      const idf = Math.log(1 + (index.N - index.df[w] + 0.5) / (index.df[w] + 0.5));          // rare words count more
      score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * t.length / index.avgLen));     // saturate repeats, normalise length
    }
    return { doc: index.docs[i], score };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
}

const index = buildIndex([
  { id: 1, text: "Export notes to PDF or Markdown from the share menu." },
  { id: 2, text: "Pro plan costs $8 per month and includes unlimited notebooks." },
  { id: 3, text: "Notes sync across devices within seconds when online." },
]);
for (const r of search(index, "how do I export my notes?")) console.log(r.score.toFixed(3), r.doc.text);
```

## Step 2 — The complete search interface

```jsx run title="RAG Search · complete app"
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

// ============ knowledge base (a fictional product) ============
const DOCS = [
  { id: "p1", source: "Pricing", title: "Plans", text: "Nimbus Notes has three plans. Free includes 3 notebooks and 100 MB of storage. Pro costs $8 per month with unlimited notebooks and 50 GB of storage. Team costs $15 per user per month and adds shared workspaces." },
  { id: "p2", source: "Pricing", title: "Discounts", text: "Annual billing saves 20 percent. Students and teachers get Pro free with a school email address." },
  { id: "p3", source: "Pricing", title: "Refunds", text: "You can request a full refund within 30 days of purchase from the billing page. Refunds take 5 to 7 business days to appear." },
  { id: "s1", source: "Sync", title: "How sync works", text: "Notes sync across all your devices within a few seconds when you are online. Changes made offline are saved locally and synced when you reconnect." },
  { id: "s2", source: "Sync", title: "Conflicts", text: "If the same note is edited on two offline devices, Nimbus keeps both versions and marks the note with a conflict badge so you can merge them." },
  { id: "e1", source: "Export", title: "Exporting notes", text: "Export any note or notebook to PDF, Markdown or HTML from the share menu. Exports include images and attachments." },
  { id: "e2", source: "Export", title: "Bulk export", text: "Team admins can bulk export every workspace as a ZIP file from the admin console. Large exports are emailed as a download link." },
  { id: "a1", source: "AI features", title: "Ask your notes", text: "Ask your notes lets you ask questions in plain English. It searches your notebooks and answers with links to the notes it used." },
  { id: "a2", source: "AI features", title: "Privacy of AI features", text: "AI features only read notes you choose to include. Your notes are never used to train models, and you can turn AI features off in settings." },
  { id: "k1", source: "Security", title: "Two-factor login", text: "Turn on two-factor authentication in account settings. You can use an authenticator app or a hardware security key." },
  { id: "k2", source: "Security", title: "Encryption", text: "All notes are encrypted in transit and at rest. Team plans can add customer-managed encryption keys." },
];

// ============ BM25 ============
const STOP = new Set("a an the is are was of to in on for and or how do does i my can what with it be when you your from get".split(" "));
const stem = (w) => w.replace(/(ing|ed|es|s)$/, "");
const tokenize = (s) => s.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => !STOP.has(w) && w.length > 1).map(stem) ?? [];
const toks = DOCS.map((d) => tokenize(d.title + " " + d.text));
const avgLen = toks.reduce((t, x) => t + x.length, 0) / toks.length;
const df = {};
toks.forEach((t) => new Set(t).forEach((w) => (df[w] = (df[w] || 0) + 1)));
function bm25(query) {
  const q = tokenize(query);
  return DOCS.map((doc, i) => {
    let score = 0;
    for (const w of q) {
      const tf = toks[i].filter((x) => x === w).length;
      if (tf) score += Math.log(1 + (DOCS.length - df[w] + 0.5) / (df[w] + 0.5)) * (tf * 2.5) / (tf + 1.5 * (0.25 + 0.75 * toks[i].length / avgLen));
    }
    return { doc, score };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
}

// ============ answer: pick the best sentences from the top passages, cite them ============
const MIN_SCORE = 1.2;                                        // below this, we don't trust the match
function buildAnswer(query, results) {
  const top = results.slice(0, 3).filter((r) => r.score >= MIN_SCORE && r.score >= results[0].score * 0.6);   // strong AND close to the best
  if (!top.length) return { text: "I don't know — the knowledge base doesn't seem to cover that. Try rephrasing, or contact support.", cites: [] };
  const q = new Set(tokenize(query));
  const sentences = top.flatMap((r, i) => r.doc.text.match(/[^.]+\./g).map((s) => ({ s: s.trim(), cite: i + 1, overlap: new Set(tokenize(s).filter((w) => q.has(w))).size })));
  const best = Math.max(...sentences.map((x) => x.overlap));
  const picked = sentences.filter((x) => x.overlap > 0 && x.overlap >= Math.ceil(best / 2)).sort((a, b) => b.overlap - a.overlap).slice(0, 2);
  return { text: picked.map((p) => `${p.s} [${p.cite}]`).join(" "), cites: top.map((r) => r.doc) };
}

// ============ UI pieces ============
function Highlight({ text, terms }) {
  if (!terms.length) return text;
  const parts = text.split(/(\s+)/);
  return parts.map((p, i) => terms.includes(stem(p.toLowerCase().replace(/[^a-z0-9]/g, ""))) ? <mark key={i}>{p}</mark> : p);
}

function StreamedAnswer({ answer, onCite }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    const words = answer.text.split(" ");
    let i = 0;
    const id = setInterval(() => { i++; setShown(words.slice(0, i).join(" ")); if (i >= words.length) clearInterval(id); }, 30);
    return () => clearInterval(id);
  }, [answer.text]);
  const done = shown.length >= answer.text.length;
  return (
    <div className="card" style={{ borderLeft: "4px solid var(--accent)" }} aria-live="polite" aria-busy={!done}>
      <small className="muted">✨ Answer {answer.cites.length ? "from your docs" : ""}</small>
      <p style={{ margin: "4px 0 0" }}>
        {shown.split(/(\[\d\])/).map((part, i) => /^\[\d\]$/.test(part)
          ? <button key={i} onClick={() => onCite(answer.cites[Number(part[1]) - 1].id)} style={{ padding: "0 5px", fontSize: 12, verticalAlign: "super" }} aria-label={`Source ${part[1]}`}>{part[1]}</button>
          : part)}
        {!done && <span className="cursor">▍</span>}
      </p>
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState("can I get a refund?");
  const deferredQuery = useDeferredValue(query);
  const [source, setSource] = useState(null);
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const listRef = useRef(null);

  const results = useMemo(() => bm25(deferredQuery), [deferredQuery]);
  const filtered = source ? results.filter((r) => r.doc.source === source) : results;
  const facets = useMemo(() => Object.entries(results.reduce((m, r) => ({ ...m, [r.doc.source]: (m[r.doc.source] || 0) + 1 }), {})), [results]);
  const answer = useMemo(() => buildAnswer(deferredQuery, results), [deferredQuery, results]);
  const terms = tokenize(deferredQuery);
  const maxScore = results[0]?.score || 1;

  useEffect(() => { setActive(0); setExpanded(null); }, [deferredQuery, source]);

  function onKeyDown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && filtered[active]) setExpanded((x) => (x === filtered[active].doc.id ? null : filtered[active].doc.id));
  }
  function jumpTo(id) {
    setSource(null);
    const i = results.findIndex((r) => r.doc.id === id);
    setActive(i); setExpanded(id);
    listRef.current?.querySelector(`#res-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  return (
    <div className="stack">
      <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} placeholder="Ask the docs…"
        role="combobox" aria-expanded="true" aria-controls="results" aria-activedescendant={filtered[active] ? `res-${filtered[active].doc.id}` : undefined}
        aria-label="Search the knowledge base" style={{ fontSize: 16 }} />
      <div className="row" style={{ gap: 4 }}>
        {["How do I export notes?", "Is my data used to train models?", "student discount", "Who won the World Cup?"].map((s) => (
          <button key={s} onClick={() => setQuery(s)} style={{ padding: "1px 8px", fontSize: 12 }}>{s}</button>
        ))}
      </div>

      {deferredQuery.trim() && <StreamedAnswer answer={answer} onCite={jumpTo} />}

      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row" style={{ gap: 4 }}>
          <button onClick={() => setSource(null)} aria-pressed={!source} className={!source ? "primary" : ""} style={{ padding: "1px 8px", fontSize: 12 }}>All {results.length}</button>
          {facets.map(([name, n]) => (
            <button key={name} onClick={() => setSource(name)} aria-pressed={source === name} className={source === name ? "primary" : ""} style={{ padding: "1px 8px", fontSize: 12 }}>{name} {n}</button>
          ))}
        </div>
        <small className="muted">{query !== deferredQuery ? "searching…" : "↑ ↓ to move · Enter to expand"}</small>
      </div>

      <div id="results" role="listbox" ref={listRef} className="stack" style={{ maxHeight: 280, overflowY: "auto", gap: 6 }}>
        {filtered.map((r, i) => {
          const citeNo = answer.cites.findIndex((c) => c.id === r.doc.id) + 1;
          return (
            <div key={r.doc.id} id={`res-${r.doc.id}`} role="option" aria-selected={i === active}
              onClick={() => { setActive(i); setExpanded(expanded === r.doc.id ? null : r.doc.id); }}
              className="card" style={{ padding: "8px 12px", cursor: "pointer", borderColor: i === active ? "var(--accent)" : undefined }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>{citeNo > 0 && <b style={{ color: "var(--accent)" }}>[{citeNo}] </b>}<b>{r.doc.title}</b> <small className="muted">· {r.doc.source}</small></span>
                <span className="row" style={{ gap: 6 }} title={`BM25 score ${r.score.toFixed(2)}`}>
                  <span style={{ width: 50, height: 5, background: "var(--border)", borderRadius: 3 }}><span style={{ display: "block", width: `${(r.score / maxScore) * 100}%`, height: "100%", background: r.score >= MIN_SCORE ? "var(--ok)" : "var(--muted)", borderRadius: 3 }} /></span>
                  <small className="muted">{r.score.toFixed(1)}</small>
                </span>
              </div>
              <div style={{ fontSize: 14, marginTop: 4, ...(expanded === r.doc.id ? {} : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }) }}>
                <Highlight text={r.doc.text} terms={terms} />
              </div>
            </div>
          );
        })}
        {deferredQuery.trim() && filtered.length === 0 && <p className="muted">No passages match. Try different words.</p>}
      </div>
    </div>
  );
}
```

Try the suggestions — especially **"Who won the World Cup?"**, which correctly gets "I don't know". Click a citation number in the answer to jump to its source, and use ↑ ↓ Enter in the search box.

## Making it real

Replace the two local functions with backend calls; the components stay the same:

```js
// GET /api/search?q=...  → [{ id, title, source, text, score }]   (hybrid: BM25 + vectors + reranker)
// POST /api/answer { query, passages } → SSE stream of { type: "text" } events, with [n] citations
const results = useQuery({ queryKey: ["search", deferredQuery], queryFn: () => api.search(deferredQuery), enabled: !!deferredQuery });
```

On the server, the answer prompt gives the model the numbered passages and instructs it to **cite** them and to say it doesn't know when they don't contain the answer — exactly the behaviour the demo imitates.

## How it works

| Feature | Technique |
|---|---|
| instant search | `useDeferredValue` — typing never waits for ranking |
| ranking | BM25: rare words weigh more, repeats saturate, long passages are normalised |
| "I don't know" | a **score threshold**: weak matches aren't allowed to support an answer |
| citations | answer sentences carry `[n]`; buttons jump to and expand the source |
| facets | counts derived from the current results; filtering doesn't re-rank |
| keyboard | arrow keys move `active`; `aria-activedescendant` tells screen readers which result is focused |

:::exercise Extend it
1. Add **hybrid search**: combine BM25 with the toy embeddings from the Python course using reciprocal rank fusion.
2. Add **"Was this helpful?"** under the answer and log the query, sources and rating — your future eval set.
3. Show **why** a result matched: list the matched terms with their idf weights.
4. Add **query rewriting**: keep the last question and resolve follow-ups like "and for teams?".
:::

:::keypoints
- Show sources, not just answers: citations that link to passages build trust.
- Thresholds let the system say "I don't know" instead of guessing.
- `useDeferredValue` keeps search input responsive; derive facets and highlights from results.
- Keep ranking and answering behind function boundaries — local today, backend tomorrow.
:::
