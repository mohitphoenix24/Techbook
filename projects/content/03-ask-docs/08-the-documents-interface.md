---
title: The interface: polling, citations and sources
level: intermediate
time: 55
summary: Server state with React Query (a self-refreshing document list), a conversation reducer fed by the stream, citation chips that jump to their source, highlighted passages, and a dialog to read a passage in context. Real components, live.
tags: React Query, polling, citations, reducer, components
---

The back end can do everything. The interface must make it *feel* trustworthy: show that documents are being processed, show where each answer came from, and let a person check any claim in two clicks.

## Two kinds of state

An interface keeps two very different kinds of data, and mixing them is the main source of messy React:

| | Server state | UI state |
|---|---|---|
| **Examples** | the list of documents and their status | the conversation being streamed, which dialog is open, the question being typed |
| **Who owns the truth** | the server; your copy can be stale | the browser |
| **Needs** | caching, refetching, polling, invalidation after changes | plain `useState` / `useReducer` |
| **Tool here** | **React Query** (`@tanstack/react-query`) | the reducer and hooks from Project 1 |

React Query exists for the left column. You describe *what* to fetch (`queryKey`, `queryFn`); it handles loading and error states, caching, and refetching.

## Polling the document list

While documents are being processed their status changes on the server, so the browser has to keep asking. React Query makes that a single option:

```tsx src="ask-docs/frontend/src/components/Library.tsx" region="polling" title="frontend/src/components/Library.tsx"
```

`refetchInterval` can be a function of the latest data: while any document is not `ready` or `failed`, ask again every 700 ms; when all are finished, return `false` and stop. Polling costs nothing when nothing is happening.

Here is the same idea, live, against a fake server that moves a document through its life. Press **Upload a file** and watch the status, the progress bar and the end of polling (the request count stops growing when the document is ready):

```tsx run title="Polling with React Query" level=intermediate autoclick="Upload a file" wait=4500
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// A fake server: the document moves queued -> embedding (0..100%) -> ready as requests arrive.
let docs: { id: string; title: string; status: string; progress: number }[] = [];
let requests = 0;
mockServer({
  "GET /api/documents": () => {
    requests += 1;
    docs = docs.map((d) => d.status === "ready" ? d : d.progress >= 1 ? { ...d, status: "ready" } : { ...d, status: "embedding", progress: Math.min(1, d.progress + 0.34) });
    return json(docs, { delay: 120 });
  },
  "POST /api/documents": () => { docs = [...docs, { id: String(docs.length + 1), title: "Employee handbook", status: "queued", progress: 0 }]; return json(docs, { status: 202 }); },
});

const client = new QueryClient();

function Library() {
  const qc = useQueryClient();
  const documents = useQuery({
    queryKey: ["documents"],
    queryFn: () => fetch("/api/documents").then((r) => r.json()),
    refetchInterval: (q) => (q.state.data?.some((d: any) => d.status !== "ready" && d.status !== "failed") ? 700 : false),
  });
  const upload = useMutation({ mutationFn: () => fetch("/api/documents", { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }) });

  return (
    <div className="stack">
      <div className="row">
        <button className="primary" onClick={() => upload.mutate()}>Upload a file</button>
        <span className="muted">polling: {documents.isFetching ? "asking…" : "idle"} · requests so far: {requests}</span>
      </div>
      {(documents.data ?? []).map((d: any) => (
        <div className="card" key={d.id}>
          <b>{d.title}</b> <span className="muted">{d.status}</span>
          {d.status !== "ready" && <progress value={d.progress} max={1} style={{ width: "100%" }} />}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  return <QueryClientProvider client={client}><Library /></QueryClientProvider>;
}
```

Two more React Query ideas from the same file. A **mutation** is a write (upload, delete, re-index); after it succeeds we **invalidate** the `["documents"]` query, which tells React Query "your copy is stale, fetch again", and polling takes over from there:

```tsx src="ask-docs/frontend/src/components/Library.tsx" region="mutations" title="frontend/src/components/Library.tsx"
```

And files can arrive by **drag and drop** as well as by the file picker. The drop handler only has to stop the browser from opening the file and read `dataTransfer.files`:

```tsx src="ask-docs/frontend/src/components/Library.tsx" region="drop" title="frontend/src/components/Library.tsx"
```

## The conversation: a reducer fed by the stream

Each question is a **turn** that passes through states as events arrive: searching, streaming, done (or stopped, or failed). Its sources, answer, citation check and cost live *inside the turn*, so scrolling back through the chat always shows the evidence each answer had.

```ts src="ask-docs/frontend/src/askReducer.ts" region="state" title="frontend/src/askReducer.ts"
```

```ts src="ask-docs/frontend/src/askReducer.ts" region="reducer" title="frontend/src/askReducer.ts"
```

`historyOf` builds what the browser sends back as "the conversation so far": only **finished** turns, only the last four, as plain question and answer text (no sources). The hook turns each stream event into one action:

```ts src="ask-docs/frontend/src/useAsk.ts" region="ask" title="frontend/src/useAsk.ts"
```

```ts src="ask-docs/frontend/src/api.ts" region="ask-stream" title="frontend/src/api.ts"
```

This is the SSE client from Project 1, reused: the same `parseSSE` parser (copied unchanged, with its tests) and the same `AbortController` for Stop. Only the event names differ.

## Citation chips

The model writes `[1]` in plain text. We want a button. The trick is to turn each marker into a Markdown **link** with a special address, then let the Markdown renderer draw those links as buttons:

```ts src="ask-docs/frontend/src/citations.ts" region="link" title="frontend/src/citations.ts"
```

A citation to a source number that does not exist becomes `#cite-bad` and is drawn in red. The component:

```tsx src="ask-docs/frontend/src/components/Answer.tsx" region="answer" title="frontend/src/components/Answer.tsx"
```

This is the real `Answer` component. Below it renders a made-up answer with two sources, one good citation, one citation to a source that does not exist, and an answer with no citations at all. Click the chips.

```tsx run src="ask-docs/frontend/src/citations.ts,ask-docs/frontend/src/components/Answer.tsx" flat title="The real Answer component and its citation chips" level=advanced autoclick="Valid citation"
import { useState } from "react";

const sources = [{ n: 1 }, { n: 2 }];
const turns = {
  "Valid citation": { answer: "Every full-time employee gets **24 days** of paid annual leave [1]. Unused days can be carried over [2].", citations: { used: [1, 2], invalid: [], refused: false, uncited: false } },
  "Invented citation": { answer: "You get 30 days [1] and a bonus week [7].", citations: { used: [1], invalid: [7], refused: false, uncited: false } },
  "No citation": { answer: "You get plenty of leave.", citations: { used: [], invalid: [], refused: false, uncited: true } },
  "Refusal": { answer: "I couldn't find that in your documents.", citations: { used: [], invalid: [], refused: true, uncited: false } },
};

export default function App() {
  const [which, setWhich] = useState<keyof typeof turns>("Valid citation");
  const [clicked, setClicked] = useState<number | null>(null);
  const t = turns[which];
  const turn: any = { id: "t", question: "", standalone: null, sources, relevant: true, answer: t.answer, status: "done", citations: t.citations, usage: null, error: null };
  return (
    <div className="stack">
      <style>{`.cite{display:inline-grid;place-items:center;min-width:20px;height:20px;margin:0 2px;font-size:12px;font-weight:700;border-radius:6px;border:0;background:#7c3aed;color:#fff}.cite.bad{background:#dc2626}.flag{font-size:13px;margin:6px 0 0}.flag.warn{color:#d97706}.refused{font-style:italic;opacity:.7}`}</style>
      <div className="row">{(Object.keys(turns) as (keyof typeof turns)[]).map((k) => <button key={k} className={k === which ? "primary" : ""} onClick={() => { setWhich(k); setClicked(null); }}>{k}</button>)}</div>
      <div className="card"><Answer turn={turn} onCite={setClicked} /></div>
      <p className="muted">{clicked ? `You clicked citation ${clicked}: the page would now scroll to source ${clicked}.` : "Click a number."}</p>
    </div>
  );
}
```

## Show why a passage matched

A source card shows the passage with the question's words highlighted, and, when "Retrieval details" is on, the ranks and scores from each search. Highlighting is a pure function that cuts text into pieces:

```ts src="ask-docs/frontend/src/highlight.ts" region="highlight" title="frontend/src/highlight.ts"
```

```tsx run src="ask-docs/frontend/src/highlight.ts,ask-docs/frontend/src/components/SourceCard.tsx" flat title="The real SourceCard, with retrieval details" level=intermediate
import { useState } from "react";

const SOURCE = {
  n: 1, chunk_id: 7, document_id: "d1", document: "Employee handbook", page: 1, heading: "Leave", score: 0.0328,
  text: "Every full-time employee gets 24 days of paid annual leave per year. Leave is credited monthly, so a new joiner receives a pro-rated amount.",
  vector_score: 0.228, keyword_score: 10.09, vector_rank: 1, keyword_rank: 1,
};

export default function App() {
  const [query, setQuery] = useState("How many days of annual leave do I get?");
  const [details, setDetails] = useState(true);
  return (
    <div className="stack">
      <style>{`.source{border:1px solid #8884;border-radius:10px;padding:8px 12px}.source.cited{border-color:#7c3aed}.source header{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:14px}.num{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;background:#7c3aed;color:#fff;font-size:12px}.tag{font-size:11px;background:#16a34a22;color:#16a34a;border-radius:99px;padding:0 8px}.scores{display:flex;gap:14px;font-size:12px;opacity:.75}mark{background:#fde68a;color:#111;border-radius:3px}.link{background:none;border:0;padding:0;text-decoration:underline;font-size:13px}`}</style>
      <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Question" />
      <label><input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} /> Retrieval details</label>
      <SourceCard source={SOURCE} query={query} cited flash={false} details={details} onOpen={() => {}} />
    </div>
  );
}
```

Type a different question and watch which words light up. "Leave" also marks "Leaves" because the highlighter stems the same way the server does, so what you see is what the search matched.

## Reading a source in context

"Open in context" fetches one passage plus its neighbours and shows them in a dialog, so a reader can judge whether a quoted sentence is being used fairly:

```tsx src="ask-docs/frontend/src/components/SourceViewer.tsx" title="frontend/src/components/SourceViewer.tsx"
```

![The source dialog: the cited passage in the middle, the text before and after it dimmed](assets/img/ask-docs-context.png)

A dialog needs four things to be usable: it closes on **Escape**, it closes when you click the backdrop (but not the dialog itself, hence `stopPropagation`), it has `role="dialog"` and `aria-modal`, and its content is fetched with React Query so reopening a passage is instant.

Finally the turn view ties the pieces together. Notice what happens on a citation click: the sources panel is **opened first** (it may have been collapsed), then the card is scrolled into view and flashes briefly:

```tsx src="ask-docs/frontend/src/components/Chat.tsx" region="turn" title="frontend/src/components/Chat.tsx"
```

## Tests

The logic of the screen, as always, is tested without a browser:

```ts src="ask-docs/frontend/src/citations.test.ts" title="frontend/src/citations.test.ts"
```

```ts src="ask-docs/frontend/src/askReducer.test.ts" title="frontend/src/askReducer.test.ts"
```

A real-browser run (Playwright, 28 checks) covers the seams: samples load and become ready by polling, a question streams with clickable citations and highlighted sources, a citation flashes its card, the dialog opens and closes with Escape, a follow-up shows "Searched for", an unrelated question is refused with no sources, a document can be switched off and deleted, an upload is searchable at once, and the phone layout does not scroll sideways.

:::keypoints
- Server state (documents) and UI state (the conversation) are different: use React Query for the first, reducers for the second.
- `refetchInterval` as a function polls only while something is in progress; mutations invalidate queries so the list refreshes.
- Keep each turn's sources, answer, citation check and cost together in one object.
- Turn `[n]` into Markdown links and draw them as buttons; draw invalid citations in red.
- Highlight the question's words (with the same stemming as the server) so people see why a passage matched.
- Open the sources panel before scrolling to a source; make dialogs closable with Escape and labelled for screen readers.
:::

```quiz
? Why use React Query for the document list but a reducer for the conversation?
- React Query is faster
+ The document list is data owned by the server that goes stale and needs refetching; the conversation is state the browser builds itself
- Reducers cannot call the network
> Match the tool to the kind of state: server state needs caching and refetching, local state needs predictable updates.
? What does returning `false` from refetchInterval do?
- Deletes the data
+ Stops polling; it resumes if a mutation invalidates the query
- Reloads the page
> Polling is on only while documents are in progress, so an idle page makes no requests.
? A model writes [7] but only two sources exist. What does the interface do?
- Links to source 7 anyway
+ Draws the number in red with a tooltip: the model cited a source that does not exist
- Hides the answer
> linkCitations marks it as invalid, and the Answer component draws a warning chip instead of a button.
```

:::exercise A "copy with sources" button
Add a button to each answer that copies a Markdown version to the clipboard: the answer with `[1]` markers turned into footnotes (`[^1]`), followed by a list of footnotes with each source's document, page and the first sentence. Write the formatting as a pure function `toMarkdownWithSources(turn)` with a test. Why is a pure function better here than building the string inside the click handler?
:::
