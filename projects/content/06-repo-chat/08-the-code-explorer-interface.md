---
title: The code explorer interface
level: intermediate
time: 55
summary: An answer is only as good as your ability to check it. A file tree, a code viewer that scrolls to and highlights exactly the cited lines, citations drawn as chips coloured by the server's verdict, and an evidence panel that shows what the model saw and why. Plain pure modules plus thin components, running in your browser.
tags: React, TypeScript, UX, citations, accessibility, code viewer
---

A good answer that cannot be checked is only a claim. The whole point of citing `file:lines` is that a person can **click it and see**. So the interface for a code question is not mainly a chat: it is a way to move between *what was said* and *the code it refers to*, in one click, with the right lines already highlighted.

![The answer on the left; clicking a citation opens the file on the right with exactly lines 20 to 29 highlighted](assets/img/repo-chat-answer.png)

## Four views that work together

```text
file tree  ──click a file──▶  code viewer  ◀──click a citation──  answer
                                   ▲                                  │
                                   └──click a piece of evidence── "What I looked at"
```

| View | Shows | A click on it |
|---|---|---|
| **File tree** | the repository's folders and files, with line counts | opens the whole file, nothing highlighted |
| **Answer** | text, with `[path:start-end]` drawn as chips coloured by their verdict | opens that file with those lines highlighted |
| **Evidence panel** | every chunk the model saw, with rank, score bar, kind, and the reasons | opens that chunk's lines |
| **Code viewer** | numbered lines, the cited ones highlighted and scrolled into view | closes |

## Pure modules first

The logic is small, pure and tested; the components only draw. Four modules:

```ts src="repo-chat/frontend/src/chatReducer.ts" region="reducer" title="frontend/src/chatReducer.ts"
```

The same pattern as Projects 1, 4 and 5: events fold into one `Turn` (the evidence found, the streamed words, the checked citations, the cost). A `Turn`'s `citations` is `null` until the server has checked them, which is how the interface knows to draw chips as "unchecked" while the answer is still streaming.

```ts src="repo-chat/frontend/src/citations.ts" region="citations" title="frontend/src/citations.ts"
```

`splitCitations` cuts an answer into plain text and citations, and **attaches the server's verdict** to each (matching on path, start and end), or `unchecked` when there is none yet. Notice that the interface does not decide whether a citation is good; it displays the verdict the server computed. One definition of "valid", in one place.

```ts src="repo-chat/frontend/src/fileTree.ts" region="tree" title="frontend/src/fileTree.ts"
```

`buildTree` turns the API's flat list of paths into nested folders (folders first, each level sorted), and `ancestors("a/b/c.py")` says which folders must be open to reveal a file, so opening a citation also expands the tree to its file.

```ts src="repo-chat/frontend/src/ranges.ts" region="ranges" title="frontend/src/ranges.ts"
```

Ranges are what the viewer highlights. `mergeRanges` joins overlapping and touching ones (two citations to lines 3-8 and 6-10 highlight 3-10 once, and the viewer reports "lines 3-10 highlighted"). `clampRange` exists for a reason you should now recognise: **a model may cite lines that do not exist**. The server flags them, and the viewer must never crash or highlight past the end of a file when asked to.

## The answer, with chips

```tsx src="repo-chat/frontend/src/components/Answer.tsx" region="answer" title="frontend/src/components/Answer.tsx"
```

- Each citation is a **button**, so it works with keyboard and screen readers, with a `title` explaining the verdict in words (colour alone is not enough).
- Colours: **valid** is the accent green; **outside what the model saw** is amber (real, but not grounded); **bad lines** and **no such file** are red, and a citation to a file that does not exist is *disabled*, because there is nothing to open.
- Rendering is deliberately tiny: lines starting with `- ` become list items and `` `backticks` `` become code. Anything more would need a real Markdown renderer, and the more of the model's output you render, the more you must sanitise.

:::warn Render model output as text
The answer is text produced by a model reading code from a stranger's repository. This component builds React elements from strings; it never inserts HTML. If you ever swap it for a Markdown library, configure it to refuse raw HTML and `javascript:` links. A model's output is *untrusted input*, like any other.
:::

## The code viewer

```tsx src="repo-chat/frontend/src/components/FileViewer.tsx" region="viewer" title="frontend/src/components/FileViewer.tsx"
```

It loads the file (with a loading state and an error state), draws each line with its number, marks the lines inside the merged ranges (`hot`), and **scrolls the first highlighted line into view** whenever the file or ranges change. That scroll is what turns a citation from a reference into an experience: you click, and the right lines are in front of you.

The lines carry `data-line` and `data-hot` attributes, which the browser test uses to assert "exactly lines 20 to 29, and no others, are highlighted".

## The evidence panel

```tsx src="repo-chat/frontend/src/components/RetrievalPanel.tsx" region="retrieval" title="frontend/src/components/RetrievalPanel.tsx"
```

A collapsible list of everything the model was shown, in the order it saw it: rank, name, kind, location, a bar showing the score as a *share of the best score* (scores are not capped, so an absolute width would be meaningless), and the reasons ("matches: retry, delay", "named in the question", "called by Worker._handle_failure"). Pieces that came from the call graph are dashed and badged. When an answer is wrong, this panel is the first thing to open: it separates "the right code was not found" (a search problem) from "it was found and misread" (a model problem).

## Try it

The real tree, viewer, answer and evidence panel, over the real sample repository. A fake server serves the files. Click a citation, a piece of evidence, or a file.

```tsx run src="repo-chat/frontend/src/ranges.ts,repo-chat/frontend/src/fileTree.ts,repo-chat/frontend/src/citations.ts,repo-chat/frontend/src/format.ts,repo-chat/frontend/src/sse.ts,repo-chat/frontend/src/api.ts,repo-chat/frontend/src/components/FileTree.tsx,repo-chat/frontend/src/components/FileViewer.tsx,repo-chat/frontend/src/components/Answer.tsx,repo-chat/frontend/src/components/RetrievalPanel.tsx" dir="repo-chat/backend/app/sample_repo" flat title="Tree, answer, evidence and viewer working together" level=advanced autoclick="retry.py:20-29"
import { useState } from "react";

mockServer({ "GET /api/repos/:id/file": ({ query }) => query.path in SAMPLE_FILES ? json({ path: query.path, lines: SAMPLE_FILES[query.path].split("\n") }) : json({ detail: { code: "not_found", message: "There is no such file in this repository." } }, { status: 404 }) });

const entries = Object.entries(SAMPLE_FILES).map(([path, text]) => ({ path, lines: text.split("\n").length, chunks: 1 }));
const ANSWER = `Here is what the code says:
- \`backoff_delay\` [jobq/retry.py:20-29]: Seconds to wait after the given failed attempt: exponential growth with a ceiling and jitter.
- \`Worker._handle_failure\` [jobq/worker.py:58-67]: Decide between a retry and giving up.
The schedule is also described at [jobq/ghost.py:10-20] and [jobq/models.py:900-950], and [jobq/storage.py:73-79] clears stale jobs.`;
const CHECKED = [
  { path: "jobq/retry.py", start: 20, end: 29, status: "valid" }, { path: "jobq/worker.py", start: 58, end: 67, status: "valid" },
  { path: "jobq/ghost.py", start: 10, end: 20, status: "no_such_file" }, { path: "jobq/models.py", start: 900, end: 950, status: "bad_lines" },
  { path: "jobq/storage.py", start: 73, end: 79, status: "outside_context" },
];
const HITS = [
  { path: "jobq/retry.py", start: 20, end: 29, kind: "function", name: "backoff_delay", score: 4.9, reasons: ["matches: retry, delay"], expanded: false },
  { path: "jobq/worker.py", start: 58, end: 67, kind: "method", name: "Worker._handle_failure", score: 4.4, reasons: ["matches: retry, delay"], expanded: false },
  { path: "jobq/retry.py", start: 32, end: 36, kind: "function", name: "should_retry", score: 2.2, reasons: ["called by Worker._handle_failure"], expanded: true },
];

export default function App() {
  const [file, setFile] = useState<{ path: string; ranges: [number, number][] } | null>(null);
  const open = (path: string, start?: number, end?: number) => setFile({ path, ranges: start ? [[start, end ?? start]] : [] });
  return (
    <div className="stack">
      <style>{`.cols{display:grid;grid-template-columns:150px minmax(0,1fr);gap:12px}.tree ul{list-style:none;margin:0;padding:0}.node{width:100%;text-align:left;border:0;background:none;padding:2px 6px;font-size:12.5px}.node.on{background:var(--card);font-weight:600}.cite{font:600 11.5px ui-monospace,monospace;padding:1px 7px;margin:0 2px;border-radius:6px;border:0;color:#fff;background:#059669}.cite.outside_context{background:#b45309}.cite.bad_lines,.cite.no_such_file{background:#dc2626}.answer p,.answer li{margin:0 0 6px;list-style:none}.retrieval{border:1px solid var(--border);border-radius:10px;padding:6px 10px;margin-bottom:8px}.hit{display:grid;grid-template-columns:20px 1fr;width:100%;text-align:left;padding:4px 6px;font-size:13px}.hit .rank{grid-row:span 3}.bar{height:4px;background:var(--border);border-radius:3px}.bar span{display:block;height:100%;background:#059669;border-radius:3px}.expanded .hit{border-style:dashed}ol{list-style:none;padding:0;margin:4px 0 0}.badge{font-size:11px;padding:0 6px;border-radius:9px;background:var(--card);margin-left:4px}.code{margin:0;font:12px/1.55 ui-monospace,monospace;max-height:230px;overflow:auto;background:#0f1a15;color:#d7e5dd;border-radius:8px}.line{display:flex;white-space:pre}.no{flex:none;width:34px;text-align:right;padding-right:8px;color:#6b8277}.line.hot{background:rgba(16,185,129,.25)}.viewer header{display:flex;gap:6px;margin-bottom:4px}.viewer .link{margin-left:auto;border:0;background:none;color:var(--accent)}`}</style>
      <div className="cols">
        <FileTree entries={entries} selected={file?.path ?? null} onOpen={(p) => open(p)} />
        <div>
          <RetrievalPanel hits={HITS} terms={["retry", "delay"]} onOpen={open} />
          <Answer text={ANSWER} citations={CHECKED} onOpen={open} />
          <FileViewer repoId="sample" path={file?.path ?? null} ranges={file?.ranges ?? []} onClose={() => setFile(null)} />
        </div>
      </div>
    </div>
  );
}
```

Click `retry.py:20-29`: the tree opens `jobq` and marks `retry.py`, the viewer loads it and scrolls to lines 20 to 29, which are highlighted. Click `models.py:900-950`: it **opens the file but highlights nothing**, since those lines do not exist: the viewer degrades gracefully instead of crashing. The `ghost.py` chip is red and disabled. The amber `storage.py:73-79` chip is a real place the model was *not* shown: you can open it, and the colour tells you it was not part of the evidence.

## The shell: three panes, three tabs

```tsx src="repo-chat/frontend/src/App.tsx" region="app" title="frontend/src/App.tsx"
```

On a desktop, tree, chat and code sit side by side. Below 900 pixels they become **tabs**, and opening a file or a citation switches to the Code tab, so on a phone a click on a chip still lands on the code. Choosing a different repository clears the chat and the open file: an answer about one repository must never sit beside the files of another.

```tsx src="repo-chat/frontend/src/components/RepoBar.tsx" region="repobar" title="frontend/src/components/RepoBar.tsx"
```

The repository bar handles upload (the file input is hidden and triggered by a button, and reset afterwards so choosing the *same* file again still fires), shows the size of what was indexed, lists what was **skipped, and why**, and offers Remove for uploads. Errors from the server (an unsafe path, too large) are shown in plain words in an alert.

## The hook

```ts src="repo-chat/frontend/src/useAsk.ts" region="ask" title="frontend/src/useAsk.ts"
```

The same hook as the earlier projects: abort any run in progress, dispatch `asked`, loop over `askStream` dispatching every event, treat an abort as "stopped" and anything else as a friendly error.

## Tests

```ts src="repo-chat/frontend/src/chatReducer.test.ts" title="frontend/src/chatReducer.test.ts"
```

```ts src="repo-chat/frontend/src/fileTree.test.ts" title="frontend/src/fileTree.test.ts"
```

```ts src="repo-chat/frontend/src/ranges.test.ts" title="frontend/src/ranges.test.ts"
```

The browser-level test (Playwright, in the repository's `tools` folder, 29 checks) drives the real thing: it asks a question, clicks a citation and asserts that lines 20 to 29 and only those are highlighted, switches the call graph off, simulates a bad citation, uploads a ZIP and asks about it, uploads a hostile ZIP and sees it refused, and checks the phone layout.

:::keypoints
- Citations earn their keep only when one click shows the cited code: link the answer, the tree, the evidence panel and the viewer.
- Keep logic in small pure modules (reducer, citation splitter, tree builder, range merger) and components thin.
- Display the server's verdict on each citation; never recompute it in the browser. Never rely on colour alone.
- Clamp ranges: a model may cite lines that do not exist, and the viewer must degrade gracefully.
- Scroll the first highlighted line into view: that is what makes a citation feel real.
- Show the evidence (what was retrieved, scores, reasons) beside the answer: it tells "not found" apart from "misread".
- Render model output as text and never as HTML.
:::

```quiz
? Why does the viewer scroll the first highlighted line into view?
- Highlighting does not work otherwise
+ A citation is only useful if the cited code is in front of the reader the moment they click
- To reduce memory
> The click should end with the right lines visible.
? A model cites lines 900 to 950 of a 36-line file. What should the viewer do?
- Crash with an error
+ Open the file and highlight nothing, while the chip shows the server's "bad lines" verdict
- Highlight the last line
> Degrade gracefully, and let the verdict explain it.
? Why show the evidence panel next to every answer?
- It looks professional
+ It separates "the right code was never found" from "it was found and misread", which need different fixes
- It is required by the API
> Debugging a RAG system starts with: was the right code retrieved?
```

:::exercise Highlight the words
In the viewer, also underline the words from the question that matched (the `terms` the server sends with the retrieval event) inside the highlighted lines. Write a pure function `markTerms(line, terms)` that returns the line cut into `{text, matched}` pieces (case-insensitive, matching whole identifier parts such as `backoff` inside `backoff_delay`), with tests, before touching React. Why must the matching use the *same* identifier splitting as the server's search?
:::
