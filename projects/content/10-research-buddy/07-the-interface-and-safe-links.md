---
title: The interface, and links you can click safely
level: easy
time: 45
summary: Show a research trail, an answer with numbered citations, and a source list, while treating every URL and every word from the model or the web as hostile. Why safeHref allows only http and https, how citation markers become links only for sources that exist, and the real components running on events you play one at a time.
tags: React, XSS, URL safety, citations UI, trust boundaries, reducer
---

ResearchBuddy's page shows words and links that came from two places nobody on your team controls: a language model and the open web. Both are **untrusted**. The front end is the last line of defence, and its rules are short.

## Rule 1: text is text

The answer, the quotes and the page titles are drawn as **React text nodes**, never as HTML. A page title such as `<img src=x onerror=alert(1)>` is shown as those exact characters, and nothing runs. This is why the project has no `dangerouslySetInnerHTML` anywhere. (Search the front-end folder for it: you will find nothing.)

The answer needs a little structure (bold, citation markers). Instead of letting HTML in, a pure function splits the text into **parts**, and React draws each part as an element:

```ts src="research-buddy/frontend/src/format.ts" region="answer" title="frontend/src/format.ts"
```

`answerParts("Pune has **7.4 million** people[1].", 1)` returns `text, bold, text, cite(1), text`. The model's characters never become markup: a `<` stays a `<`.

And a marker only counts if its source **exists**. `[3]` with two sources, or `[0]`, or `a[1]` in a code-like sentence with no sources at all, stays plain text. Otherwise a stray `[7]` would become a link to a source that is not there (a crash, or worse, a link to the wrong one).

## Rule 2: a link is a promise about where you are going

Search results carry URLs, chosen by whoever built the page. A URL is not always a website:

| URL | What clicking it does |
|---|---|
| `https://example.com/page` | opens a web page |
| `javascript:alert(document.cookie)` | **runs script in your page** |
| `data:text/html,<script>...</script>` | opens an attacker's page in a script-friendly context |
| `file:///etc/passwd` | tries to open a local file |
| `vbscript:...`, `intent://...` | older or platform-specific tricks |

If you put such a string in `<a href={url}>`, a click can run code. Search results are *supposed* to be web addresses, but "supposed to" is not a security control. So every link goes through one function:

```ts src="research-buddy/frontend/src/format.ts" region="links" title="frontend/src/format.ts"
```

`safeHref` parses the string with the browser's own `URL` class (so the browser's rules decide what counts as a scheme, including odd capitalisation like `JAVASCRIPT:`), and returns it **only if the protocol is `http:` or `https:`**. Anything else, or anything that does not parse, returns `null`, and the interface then shows the title as plain text with no link. It is an **allow-list** again: the same idea as the calculator and the note names.

The links also get `target="_blank" rel="noopener noreferrer"`: they open in a new tab, and that tab is cut off from yours (`noopener`), so a hostile page cannot reach back and redirect this one.

## The pieces

```tsx src="research-buddy/frontend/src/components/Answer.tsx" region="answer" title="frontend/src/components/Answer.tsx"
```

`Answer` draws each citation marker as a small superscript number that links to `#src-1`, `#src-2`... on the same page, where the matching source sits in `Sources`. A click scrolls to the source (and CSS `:target` highlights it), so checking a claim is one click and one glance at the quoted passage. `Sources` shows the title (a link only if `safeHref` allows), the domain, and the quote.

```tsx src="research-buddy/frontend/src/components/ResearchTrail.tsx" region="trail" title="frontend/src/components/ResearchTrail.tsx"
```

`ResearchTrail` is the visible process: each search with its query and the pages it found (in a collapsible list, with the same `safeHref` rule), and each calculation with its result. A search that failed shows its error in red. It is the cheapest honest signal an agent can give: *this is what I looked at*.

## The reducer

```ts src="research-buddy/frontend/src/chatReducer.ts" region="reducer" title="frontend/src/chatReducer.ts"
```

Compared with TaskPal's, the state has `searches` (each `running`, `ok` or `failed`) and `calcs`. A `search` event adds a running search; a `search_result` finds it **by id** and fills in the pages or the error. The final `done` event carries the answer, the numbered `sources`, every page `searched`, and the usage with the number of searches.

## See it

This block runs the project's **real** reducer and components (`ExchangeView`, `Answer`, `Sources`, `ResearchTrail`). The events are typed by hand, in the order the server would stream them for *"What are the biggest cities in India by population? Add up the top three."* Press **Play next event** and watch the trail grow and the answer appear.

Two things in the data are hostile on purpose: one search result has the URL `javascript:alert(1)`, and the answer contains a marker `[9]` for a source that does not exist.

```tsx run src="research-buddy/frontend/src/format.ts,research-buddy/frontend/src/chatReducer.ts,research-buddy/frontend/src/components/Answer.tsx,research-buddy/frontend/src/components/ResearchTrail.tsx,research-buddy/frontend/src/components/ExchangeView.tsx" flat title="The real research interface" level=easy autoclick="Play next event"
import { useReducer, useState } from "react";

const css = `
:root{--panel:var(--card);--bad:var(--danger);--bad-bg:rgba(220,38,38,.12);--muted:var(--text-dim,#64748b);--link:var(--accent)}
.muted{color:var(--muted)}.small{font-size:12.5px}.question{margin-left:auto;width:fit-content;max-width:100%;background:color-mix(in srgb,var(--accent) 14%,var(--bg));border-radius:12px;padding:8px 14px;font-weight:500}
.trace{margin-top:12px;border:1px solid var(--border);border-radius:12px;background:var(--panel)}.trace summary{padding:8px 14px;cursor:pointer;font-weight:600;font-size:13.5px;color:var(--muted)}
.trace>.note{margin:0;padding:0 14px 8px;font-style:italic;color:var(--muted);font-size:14px}
.trail{list-style:none;margin:0;padding:0 12px 12px;display:flex;flex-direction:column;gap:8px}
.step{background:var(--bg);border:1px solid var(--border);border-left:4px solid var(--muted);border-radius:10px;padding:8px 12px}
.step.ok{border-left-color:var(--ok)}.step.failed{border-left-color:var(--bad)}.step.running{border-left-color:var(--accent)}
.step .head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:14px}.step .head q,.step .head code{color:var(--muted)}.step .status{margin-left:auto;font-size:12.5px;color:var(--muted)}
.step .dot{width:8px;height:8px;border-radius:50%;background:var(--muted)}.step.ok .dot{background:var(--ok)}.step.running .dot{background:var(--accent)}
.step details{margin-top:6px;font-size:13.5px}.pages{margin:6px 0 0;padding-left:18px}.domain{color:var(--muted);font-size:12.5px;margin-left:6px}
.answer{margin:14px 0 8px;font-size:16px;line-height:1.65}.answer sup a{text-decoration:none;font-weight:700;padding:0 2px}
.sources{border-top:1px solid var(--border);padding-top:10px;margin-top:12px}.sources h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 6px}
.sources ol{margin:0;padding-left:22px;display:flex;flex-direction:column;gap:8px}.quote{display:block;color:var(--muted);font-size:13.5px}
.thinking{margin:10px 0}.usage{font-size:12px;margin:8px 0 0}
`;

const hits = [
  { title: "Census of India: largest cities", url: "https://www.mospi.gov.in/census", age: "March 2025" },
  { title: "A page whose link is a trap", url: "javascript:alert(1)", age: null },
  { title: "List of cities in India by population", url: "https://www.britannica.com/place/India", age: null },
];
const EVENTS: AgentEvent[] = [
  { type: "step", step: 0 },
  { type: "note", step: 0, text: "I'll look up the latest city figures." },
  { type: "search", id: "s1", query: "largest cities in India by population 2025" },
  { type: "search_result", id: "s1", ok: true, results: hits },
  { type: "step", step: 1 },
  { type: "tool_call", step: 1, id: "c1", name: "calculator", input: { expression: "12.69 + 11.03 + 8.44" } },
  { type: "tool_result", id: "c1", name: "calculator", ok: true, summary: "= 32.16" },
  { type: "step", step: 2 },
  { type: "done", steps: 3,
    answer: "The three largest cities are Mumbai (about 12.7 million)[1], Delhi (about 11 million)[2] and Bengaluru (about 8.4 million)[9]. Together they are **32.16 million** people. <img src=x onerror=alert(1)>",
    sources: [
      { n: 1, title: "Census of India: largest cities", url: "https://www.mospi.gov.in/census", quote: "Mumbai 12.69 million" },
      { n: 2, title: "A page whose link is a trap", url: "javascript:alert(1)", quote: "Delhi 11.03 million" },
    ],
    searched: hits, usage: { input_tokens: 18117, output_tokens: 2793, searches: 1, cost_usd: 0.138 } },
];
const asked = () => reducer(initialState, { type: "asked", id: "q1", question: "What are the biggest cities in India by population? Add up the top three." });

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, asked);
  const [n, setN] = useState(0);
  const next = () => { if (n < EVENTS.length) { dispatch({ type: "event", event: EVENTS[n] }); setN(n + 1); } };
  const reset = () => { dispatch({ type: "clear" }); dispatch({ type: "asked", id: "q1", question: "What are the biggest cities in India by population? Add up the top three." }); setN(0); };
  return (
    <div className="stack">
      <style>{css}</style>
      <div className="row">
        <button className="primary" onClick={next} disabled={n >= EVENTS.length}>Play next event</button>
        <button onClick={reset}>Start again</button>
        <span className="muted">{n}/{EVENTS.length} events · last: <code>{n ? EVENTS[n - 1].type : "none"}</code></span>
      </div>
      {state.exchanges.map((x) => <ExchangeView key={x.id} x={x} />)}
    </div>
  );
}
```

Play all the events, then look closely:

- The answer's `[1]` and `[2]` are small links to the sources. The `[9]` is **plain text**, because there is no source 9.
- The `<img ...>` in the answer is shown as characters. Nothing runs.
- Source 2 and the trap page in the trail are shown **without a link**: their `javascript:` address was refused by `safeHref`. Open the "Pages found" list to see it.
- The cost line says "1 search" and a total.

## The tests

```ts src="research-buddy/frontend/src/format.test.ts" title="frontend/src/format.test.ts"
```

The `safeHref` test is a list of everything that must be refused: `javascript:`, `JAVASCRIPT:`, `data:`, `vbscript:`, `file:`, a protocol-relative `//evil.example`, and plain text. When you write a security function, test it with the attacker's best list, and add to the list every time you hear of a new trick.

:::keypoints
- The model and the web are both untrusted. Draw their words as text nodes, never as HTML. Never use `dangerouslySetInnerHTML` for them.
- Split text into parts (text, bold, citation) in a pure function, and let React draw each as an element.
- A citation marker is a link only if its source exists.
- Only `http:` and `https:` URLs become links, checked by the browser's own URL parser. Anything else is shown as text.
- Open external links with `rel="noopener noreferrer"`.
- Test a security function with the attacker's best list of inputs.
:::

```quiz
? Why does safeHref parse the string with `new URL` instead of checking that it starts with "http"?
- It is shorter
+ The browser's own rules decide what the scheme is, including capital letters and odd spellings
- Because regular expressions are banned
> Parse with the same parser the browser will use.
? A search result's URL is `javascript:alert(1)`. What does the interface do?
- Makes it a link
+ Shows the title as plain text with no link
- Removes the result
> The link is refused; the information is still shown.
? The model writes `[9]` but there are two sources. What happens?
- A broken link appears
+ `[9]` stays plain text
- The page crashes
> A marker only counts if its source exists.
```

:::exercise Show the domain first
Search results can be disguised: a title that says "Reserve Bank of India" with a link to `rbi.example-news.biz`. Make `Sources` show the **domain** in bold before the title, and add a small label for domains in a short allow-list you choose (for example `.gov.in`, `.edu`). Write the pure function `trustLabel(url)` with tests. Then say why a label like this helps a reader but must never replace their judgement.
:::
