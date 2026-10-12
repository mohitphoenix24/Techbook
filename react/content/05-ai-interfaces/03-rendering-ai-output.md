---
title: Rendering AI Output Safely
level: advanced
time: 35
summary: Models answer in Markdown — headings, lists, tables and code. Render it beautifully and safely, without XSS: why dangerouslySetInnerHTML is risky, a small Markdown-to-React renderer you can read, code blocks with copy buttons, citations, half-finished streaming Markdown, and the production libraries.
---

Model answers are usually **Markdown**: `**bold**`, lists, tables and fenced code. Showing it as plain text looks broken; turning it into HTML naïvely is a **security hole**. This lesson does it properly.

:::def Markdown
A lightweight text format: `# Heading`, `- list item`, `**bold**`, `` `code` ``, and code blocks between triple backticks. Models are trained to write it.
:::

:::def XSS (cross-site scripting)
An attack where untrusted text gets inserted into the page **as HTML**, so a `<script>` or `<img onerror=…>` inside it runs in your users' browsers — able to steal sessions or act as the user.
:::

## Why model output is untrusted

Model output can contain **anything a user or a document put into the prompt** — including text crafted to be HTML. A RAG answer quoting a malicious web page could include `<img src=x onerror="steal()">`.

```jsx run level=intermediate
const modelOutput = 'Here is your summary. <img src="x" onerror="document.body.style.background=\'crimson\'; console.log(\'💥 attacker code ran!\')">';

function Unsafe({ text }) {
  return <div className="card" dangerouslySetInnerHTML={{ __html: text }} />;   // ❌ runs the onerror code
}

function Safe({ text }) {
  return <div className="card">{text}</div>;                                     // ✅ React escapes text
}

export default function App() {
  return (
    <div className="stack" style={{ maxWidth: 460 }}>
      <b>✅ Rendered as text (safe):</b>
      <Safe text={modelOutput} />
      <b>❌ Rendered as HTML (unsafe) — watch the background and console:</b>
      <Unsafe text={modelOutput} />
    </div>
  );
}
```

:::warn The rule
Text in `{curly braces}` is always safe: React escapes it. `dangerouslySetInnerHTML` is unsafe with model or user content unless the HTML is **sanitised** first (for example with DOMPurify). The best approach: turn Markdown into **React elements**, never into an HTML string.
:::

## A tiny Markdown → React renderer

To see how real renderers work, here's one in ~80 lines. It builds **React elements** (so everything is escaped), only allows `http(s)` links, renders citations like `[1]`, and adds a **Copy** button to code blocks.

```jsx run level=advanced
import { useState } from "react";

// ---------- inline: **bold**, *italic*, `code`, [text](url), [1] citations -----------------
function renderInline(text, sources, keyBase = "") {
  const out = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\))|(\[(\d+)\])/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = keyBase + i++;
    if (m[1]) out.push(<strong key={k}>{m[2]}</strong>);
    else if (m[3]) out.push(<em key={k}>{m[4]}</em>);
    else if (m[5]) out.push(<code key={k}>{m[6]}</code>);
    else if (m[7]) {
      const safe = /^https?:\/\//i.test(m[9]);                     // block javascript: and data: URLs
      out.push(safe ? <a key={k} href={m[9]} target="_blank" rel="noreferrer noopener">{m[8]}</a> : <span key={k}>{m[8]}</span>);
    } else if (m[10]) {
      const src = sources[Number(m[11]) - 1];
      out.push(<sup key={k} title={src?.title}><a href={src?.url ?? "#"} target="_blank" rel="noreferrer">[{m[11]}]</a></sup>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ---------- blocks: headings, lists, code fences, paragraphs --------------------------------
function Markdown({ text, sources = [] }) {
  const lines = text.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (line.startsWith("```")) {                                   // code block (may be unfinished while streaming)
      const lang = line.slice(3).trim();
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++;
      blocks.push(<CodeBlock key={blocks.length} lang={lang} code={body.join("\n")} />);
    } else if (/^#{1,3} /.test(line)) {
      const level = line.match(/^#+/)[0].length;
      const Tag = `h${level + 2}`;                                   // keep model headings smaller than page headings
      blocks.push(<Tag key={blocks.length}>{renderInline(line.replace(/^#+ /, ""), sources)}</Tag>);
      i++;
    } else if (/^\s*([-*]|\d+\.) /.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.) /.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.) /, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={blocks.length}>{items.map((it, j) => <li key={j}>{renderInline(it, sources, j + "-")}</li>)}</List>);
    } else if (line.trim() === "") {
      i++;
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,3} |```|\s*([-*]|\d+\.) )/.test(lines[i])) para.push(lines[i++]);
      blocks.push(<p key={blocks.length}>{renderInline(para.join(" "), sources)}</p>);
    }
  }
  return <div className="markdown">{blocks}</div>;
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(code); } catch { console.log("(clipboard blocked in this preview) copied text:\n" + code); }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div style={{ position: "relative" }}>
      <div className="row" style={{ justifyContent: "space-between", fontSize: 12 }}>
        <span className="muted">{lang || "text"}</span>
        <button onClick={copy} aria-label="Copy code" style={{ padding: "2px 8px", fontSize: 12 }}>{copied ? "✓ Copied" : "Copy"}</button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

// ---------- try it ---------------------------------------------------------------------------
const answer = `## Embeddings in one minute
An **embedding** turns text into a list of numbers, so *similar meanings* end up close together [1].

1. Split documents into chunks
2. Embed each chunk with \`voyage-4\` [2]
3. Store vectors and search by cosine similarity

\`\`\`python
scores = doc_vectors @ query_vector
best = scores.argsort()[::-1][:3]
\`\`\`

Read more in the [guide](https://example.com/rag). Sneaky link: [click me](javascript:alert(1))`;

const sources = [
  { title: "Intro to embeddings", url: "https://example.com/embeddings" },
  { title: "Voyage AI docs", url: "https://example.com/voyage" },
];

export default function App() {
  const [text, setText] = useState(answer);
  return (
    <div className="stack">
      <div className="card"><Markdown text={text} sources={sources} /></div>
      <details><summary className="muted">Edit the raw Markdown</summary>
        <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} style={{ width: "100%", fontFamily: "monospace" }} />
      </details>
    </div>
  );
}
```

Notice the `javascript:` link was rendered as plain text — it can't run code.

## Streaming Markdown

While an answer streams, the Markdown is **unfinished**: an opened code fence with no closing fence, a `**bold` with no end. A good renderer must not flicker or crash. Two tricks:

1. Parse **leniently** — the renderer above treats an unclosed ` ``` ` as "code until the end", so a half-written code block already looks like code.
2. **Split finished and unfinished parts**: finished paragraphs never change, so memoise them and only re-render the last block.

```jsx run level=advanced
import { memo, useEffect, useState } from "react";

const full = "First, install the SDK:\n\n```bash\nnpm install @anthropic-ai/sdk\n```\n\nThen create a client and call messages.create.\n\nThat's it!";

// Split text into blocks at blank lines — but never inside an open code fence
function splitBlocks(text) {
  const blocks = []; let cur = []; let inFence = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) inFence = !inFence;
    if (!inFence && line === "" && cur.length) { blocks.push(cur.join("\n")); cur = []; }
    else cur.push(line);
  }
  if (cur.length) blocks.push(cur.join("\n"));
  return blocks;
}

let renders = 0;
const Block = memo(function Block({ text }) {
  renders++;
  if (text.startsWith("```")) {
    const body = text.split("\n").slice(1).filter((l) => !l.startsWith("```")).join("\n");
    return <pre><code>{body}</code></pre>;
  }
  return <p>{text}</p>;
});

export default function App() {
  const [shown, setShown] = useState("");
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => { i += 3; setShown(full.slice(0, i)); if (i >= full.length) clearInterval(id); }, 40);
    return () => clearInterval(id);
  }, []);
  const blocks = splitBlocks(shown);
  return (
    <div className="stack" style={{ maxWidth: 440 }}>
      <div className="card">{blocks.map((b, i) => <Block key={i} text={b} />)}</div>
      <span className="muted">Blocks: {blocks.length} · finished blocks are memoised, so only the last one re-renders.</span>
    </div>
  );
}
```

## In production: use a library

```bash
npm install react-markdown remark-gfm rehype-highlight
```

```jsx
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";            // tables, task lists, strikethrough
import rehypeHighlight from "rehype-highlight"; // syntax colours for code

function AssistantMessage({ text }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        a: (props) => <a {...props} target="_blank" rel="noreferrer noopener" />,
        code: ({ className, children, ...rest }) =>
          className ? <CodeBlock lang={className.replace("language-", "")} code={String(children)} /> : <code {...rest}>{children}</code>,
      }}
    >
      {text}
    </Markdown>
  );
}
```

`react-markdown` builds React elements and **ignores raw HTML by default**, so it's safe for model output. Don't add `rehype-raw` unless you also sanitise.

| Need | Library |
|---|---|
| Markdown → React | `react-markdown` (+ `remark-gfm`) |
| fast streaming Markdown | `streamdown` and similar streaming-aware renderers |
| syntax highlighting | `rehype-highlight`, `shiki` |
| maths ($E=mc^2$) | `remark-math` + `rehype-katex` |
| sanitising HTML (if you must) | `DOMPurify` |

:::ai
Other model outputs need care too: **links** (only `http(s)`, open in a new tab with `rel="noopener"`), **images** the model suggests (only from your own domains, or users can be tracked), **generated code** (show, don't execute — or run it in a sandboxed iframe like this site does), and **citations** (map `[1]` to the actual retrieved source so users can verify claims).
:::

## Check yourself

```quiz
? Why is `dangerouslySetInnerHTML={{ __html: modelText }}` risky?
+ The model's text may contain HTML/JS that runs in your users' browsers (XSS)
- It's slow
- It doesn't support Markdown
> Model output is untrusted — escape it or sanitise it.

? Which link should your renderer refuse to make clickable?
+ [click](javascript:stealCookies())
- [docs](https://react.dev)
- [paper](https://arxiv.org/abs/1706.03762)
> Only allow http(s) URLs.

? How do you keep a long streaming answer smooth?
+ Split it into blocks and memoise the finished ones
- Re-parse and re-render everything on every token
- Wait until the stream ends to show anything
> Only the last, still-growing block needs to re-render.
```

:::keypoints
- Model output is **untrusted**: render it as React elements, never raw HTML (or sanitise with DOMPurify).
- Markdown → React: headings, lists, code blocks with **Copy**, safe links (`http(s)` only), citations mapped to sources.
- Streaming Markdown is unfinished — parse leniently and memoise finished blocks.
- In production use `react-markdown` + `remark-gfm` + a highlighter; it ignores raw HTML by default.
:::
