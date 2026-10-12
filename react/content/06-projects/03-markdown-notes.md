---
title: Markdown Notes with Smart Summary
level: intermediate
time: 50
icon: file
cover: #f59e0b,#ec4899
tags: markdown, useDeferredValue, search, tags, localStorage, summarisation
summary: A notes app with live Markdown preview, #tags, instant full-text search with highlighted matches, word counts, autosave — and a "Summarise" button powered by a small extractive summariser you can later swap for a model.
---

A notes app is a great "real" project: a list, an editor, a preview, search and persistence. We'll add two AI-flavoured touches: **automatic #tags** and a **Summarise** button — first with a simple local algorithm, ready to be replaced by a model call.

:::flow Data flow
notes[] | in state + localStorage
selected note | editor (textarea)
parse | tags, words, preview
search | useDeferredValue
summarise | extractive → model later
:::

**You'll practise:** lifting state, controlled textareas, derived data, `useDeferredValue`, highlighting matches safely, a small Markdown renderer, autosave, and a pluggable "AI" function.

## Step 1 — An extractive summariser

**Extractive summarisation** picks the most important existing sentences instead of writing new ones. A classic way: score each sentence by how many of the note's *frequent, meaningful* words it contains.

```js run title="Step 1 · summarise()"
const STOP = new Set("the a an and or but of to in on for with is are was were be it this that as at by from you your we our i".split(" "));

function summarise(text, maxSentences = 2) {
  const plain = text.replace(/[*`]/g, "").replace(/[#>-]/g, " ");
  const sentences = plain.match(/[^.!?\n]+[.!?]/g)?.map((s) => s.trim()).filter((s) => s.split(" ").length > 3) ?? [];
  if (sentences.length <= maxSentences) return sentences.join(" ");
  const freq = {};
  for (const w of plain.toLowerCase().match(/[a-z']+/g) ?? []) if (!STOP.has(w) && w.length > 2) freq[w] = (freq[w] || 0) + 1;
  const scored = sentences.map((s, i) => {
    const words = s.toLowerCase().match(/[a-z']+/g) ?? [];
    const score = words.reduce((sum, w) => sum + (freq[w] || 0), 0) / Math.sqrt(words.length);   // don't just favour long sentences
    return { s, i, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, maxSentences).sort((a, b) => a.i - b.i).map((x) => x.s).join(" ");
}

const note = `Embeddings turn text into vectors. Similar texts get vectors that point in similar directions.
We store document embeddings in a vector database. At question time we embed the question and find the nearest document vectors.
The weather was nice today. Those nearest documents are added to the prompt so the model can answer with sources.`;
console.log(summarise(note));
```

## Step 2 — The complete app

```jsx run title="Markdown Notes · complete app"
import { useDeferredValue, useEffect, useMemo, useState } from "react";

const KEY = "lab-notes-v1";
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const SAMPLE = [
  { id: "n1", updatedAt: Date.now() - 3e5, text: "# RAG checklist\nChunk documents by **headings**, not fixed sizes. Store the section title with each chunk.\n\n- Use hybrid search (BM25 + vectors)\n- Rerank the top 20\n- Always show `sources`\n\nAnswers must say \"I don't know\" when the context is missing. #rag #todo" },
  { id: "n2", updatedAt: Date.now() - 9e5, text: "# Prompt ideas\nGive the model a *role*, clear steps, and examples of good output. Ask for JSON when the UI needs fields.\n\nTest prompts against a fixed eval set before shipping. #prompts" },
  { id: "n3", updatedAt: Date.now() - 2e6, text: "# React 19 notes\nActions handle pending state for forms. **useOptimistic** shows the result instantly and rolls back on error. #react" },
];

// ---------- helpers ----------
const STOP = new Set("the a an and or but of to in on for with is are was were be it this that as at by from you your we our i".split(" "));
function summarise(text, n = 2) {
  const plain = text.replace(/#\w+/g, "").replace(/[*`]/g, "").replace(/[#>-]/g, " ");
  const sentences = plain.match(/[^.!?\n]+[.!?]/g)?.map((s) => s.trim()).filter((s) => s.split(" ").length > 3) ?? [];
  if (sentences.length <= n) return sentences.join(" ") || "Not enough text to summarise yet.";
  const freq = {};
  for (const w of plain.toLowerCase().match(/[a-z']+/g) ?? []) if (!STOP.has(w) && w.length > 2) freq[w] = (freq[w] || 0) + 1;
  return sentences.map((s, i) => {
    const words = s.toLowerCase().match(/[a-z']+/g) ?? [];
    return { s, i, score: words.reduce((t, w) => t + (freq[w] || 0), 0) / Math.sqrt(words.length) };
  }).sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i).map((x) => x.s).join(" ");
}
const titleOf = (text) => text.split("\n")[0].replace(/^#+\s*/, "").trim() || "Untitled";
const tagsOf = (text) => [...new Set(text.match(/(?<=^|\s)#[a-z0-9-]+/gi)?.map((t) => t.toLowerCase()) ?? [])];
const wordsOf = (text) => text.trim() ? text.trim().split(/\s+/).length : 0;

function Highlight({ text, query }) {                       // safe: builds elements, no HTML strings
  if (!query) return text;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + query.length)}</mark>{text.slice(i + query.length)}</>;
}

function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|#[a-z0-9-]+)/gi).map((p, i) =>
    /^\*\*/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong>
    : /^`/.test(p) ? <code key={i}>{p.slice(1, -1)}</code>
    : /^\*.+\*$/.test(p) ? <em key={i}>{p.slice(1, -1)}</em>
    : /^#[a-z0-9-]+$/i.test(p) ? <span key={i} style={{ color: "var(--accent)" }}>{p}</span>
    : p);
}
function Preview({ text }) {
  return text.split(/\n{2,}/).map((block, i) => {
    const lines = block.split("\n");
    if (lines.every((l) => /^[-*] /.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>;
    return lines.map((l, j) => {
      const h = l.match(/^(#{1,3}) (.*)/);
      return h ? <div key={`${i}-${j}`} style={{ fontWeight: 700, fontSize: 22 - h[1].length * 2, margin: "4px 0" }}>{inline(h[2])}</div>
               : <p key={`${i}-${j}`} style={{ margin: "0 0 6px" }}>{inline(l)}</p>;
    });
  });
}

// side-by-side on wide screens, stacked on phones
const LAYOUT_CSS = `
  .notes-shell { display: flex; gap: 12px; align-items: stretch; }
  .notes-side { width: 190px; flex-shrink: 0; }
  .notes-list { max-height: 300px; overflow-y: auto; }
  .notes-panes { display: flex; gap: 8px; align-items: stretch; }
  .notes-panes > * { flex: 1; min-width: 0; }
  @media (max-width: 560px) {
    .notes-shell, .notes-panes { flex-direction: column; }
    .notes-side { width: auto; }
    .notes-list { max-height: 130px; }
  }`;

// ---------- the app ----------
export default function App() {
  const [notes, setNotes] = useState(() => { try { return JSON.parse(localStorage.getItem(KEY)) ?? SAMPLE; } catch { return SAMPLE; } });
  const [selectedId, setSelectedId] = useState(notes[0]?.id);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState(null);
  const [mode, setMode] = useState("split");                // edit | split | preview
  const [summary, setSummary] = useState(null);
  const deferredQuery = useDeferredValue(query);
  const [saved, setSaved] = useState(true);

  useEffect(() => {                                         // debounced autosave
    setSaved(false);
    const t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch {} setSaved(true); }, 400);
    return () => clearTimeout(t);
  }, [notes]);

  const selected = notes.find((n) => n.id === selectedId);
  const allTags = useMemo(() => [...new Set(notes.flatMap((n) => tagsOf(n.text)))].sort(), [notes]);
  const visible = useMemo(() => notes
    .filter((n) => !tag || tagsOf(n.text).includes(tag))
    .filter((n) => !deferredQuery || n.text.toLowerCase().includes(deferredQuery.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt), [notes, tag, deferredQuery]);

  function update(text) {
    setNotes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, text, updatedAt: Date.now() } : n)));
    setSummary(null);
  }
  function add() {
    const note = { id: newId(), text: "# New note\n", updatedAt: Date.now() };
    setNotes((ns) => [note, ...ns]); setSelectedId(note.id); setMode("edit"); setTag(null); setQuery("");
  }
  function remove(id) {
    const rest = notes.filter((n) => n.id !== id);
    setNotes(rest); setSelectedId(rest[0]?.id);
  }
  function snippet(text) {
    const body = text.split("\n").slice(1).join(" ").replace(/[#*`]/g, "");   // skip the title line, drop Markdown symbols
    const i = deferredQuery ? body.toLowerCase().indexOf(deferredQuery.toLowerCase()) : -1;
    return i < 0 ? body.slice(0, 60) : body.slice(Math.max(0, i - 20), i + 40);
  }

  return (
    <div className="notes-shell">
      <style>{LAYOUT_CSS}</style>
      {/* list */}
      <aside className="stack notes-side">
        <div className="row"><button className="primary" onClick={add} style={{ flex: 1 }}>＋ New</button></div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes…" aria-label="Search notes" />
        <div className="row" style={{ gap: 4 }}>
          {allTags.map((t) => <button key={t} onClick={() => setTag(tag === t ? null : t)} aria-pressed={tag === t}
            style={{ padding: "1px 7px", fontSize: 12 }} className={tag === t ? "primary" : ""}>{t}</button>)}
        </div>
        <div className="stack notes-list" style={{ gap: 4, opacity: query !== deferredQuery ? 0.6 : 1 }}>
          {visible.map((n) => (
            <button key={n.id} onClick={() => { setSelectedId(n.id); setSummary(null); }} aria-current={n.id === selectedId}
              style={{ textAlign: "left", padding: "6px 8px", background: n.id === selectedId ? "color-mix(in srgb, var(--accent) 16%, transparent)" : undefined }}>
              <div style={{ fontWeight: 600 }}><Highlight text={titleOf(n.text)} query={deferredQuery} /></div>
              <small className="muted"><Highlight text={snippet(n.text)} query={deferredQuery} /></small>
            </button>
          ))}
          {visible.length === 0 && <small className="muted">No notes match.</small>}
        </div>
      </aside>

      {/* editor */}
      {selected ? (
        <main className="stack" style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="row" role="group" aria-label="View mode">
              {["edit", "split", "preview"].map((m) => <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={mode === m ? "primary" : ""} style={{ padding: "3px 10px" }}>{m}</button>)}
            </div>
            <div className="row">
              <button onClick={() => setSummary(summarise(selected.text))}>✨ Summarise</button>
              <button onClick={() => remove(selected.id)} aria-label="Delete note">🗑</button>
            </div>
          </div>
          {summary && <div className="card" role="status" style={{ borderLeft: "4px solid var(--accent)" }}><small className="muted">Summary (extractive)</small><div>{summary}</div></div>}
          <div className="notes-panes">
            {mode !== "preview" && <textarea value={selected.text} onChange={(e) => update(e.target.value)} aria-label="Note text"
              style={{ flex: 1, minHeight: 260, fontFamily: "JetBrains Mono, monospace", fontSize: 13 }} />}
            {mode !== "edit" && <div className="card" style={{ flex: 1, minHeight: 260, overflow: "auto" }}><Preview text={selected.text} /></div>}
          </div>
          <small className="muted">{wordsOf(selected.text)} words · {tagsOf(selected.text).join(" ") || "no tags"} · {saved ? "✓ saved" : "saving…"}</small>
        </main>
      ) : <p className="muted">No note selected.</p>}
    </div>
  );
}
```

Try: type `#ideas` in a note to create a tag, search for "prompt", switch view modes, and press **✨ Summarise** on the RAG checklist.

## Swap in a model for summaries

```js
async function summarise(text) {
  const res = await fetch("/api/summarise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Summary failed");
  return (await res.json()).summary;          // the backend calls Claude with "Summarise in 2 sentences"
}
// In the button handler: setSummary("…"); setSummary(await summarise(selected.text));
```

## How it works

| Feature | Technique |
|---|---|
| tags, title, word count | **derived** from the note text with small pure functions |
| instant search | `useDeferredValue(query)` — the input stays responsive; the list dims while catching up |
| highlighted matches | split the text and wrap the match in `<mark>` — no HTML strings |
| autosave | an effect with a 400 ms debounce and a "saving…/saved" indicator |
| responsive layout | a `<style>` tag with a media query: three columns on wide screens, stacked on phones |
| summary | a pure function today; an `async` backend call tomorrow — same button |

:::exercise Extend it
1. Add **pinning** and **sort by title / date**.
2. Replace the extractive summary with a **streamed** model summary (use the `readSSE` helper).
3. Add **"Ask my notes"**: rank notes by keyword overlap with a question and show the top 3 — a tiny RAG.
4. Use `react-markdown` for the preview and add a **table of contents** from headings.
:::

:::keypoints
- Keep one source of truth (the notes array); derive titles, tags, counts and search results.
- `useDeferredValue` keeps typing smooth while expensive lists update.
- Debounce autosave and show its status.
- Keep "AI" features behind a function boundary so local and model-powered versions are interchangeable.
:::
