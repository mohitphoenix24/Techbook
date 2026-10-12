---
title: Streaming AI Chat App
level: advanced
time: 75
icon: message
cover: #6366f1,#22d3ee
tags: streaming, SSE, zustand, persist, abort, markdown
summary: A complete ChatGPT/Claude-style app — multiple conversations in a sidebar, streamed answers with a Stop button, regenerate, copy, auto-titles, search, Markdown with code blocks, and persistence — with a fake model you can swap for your real backend in one function.
---

This is the flagship project: a full chat interface with the architecture real AI products use. Everything runs here with a **fake streaming model**; to make it real, you replace one function (`streamReply`) with a `fetch` to your backend from the *Streaming Chat* lesson.

:::flow Architecture
Composer | Enter to send
useChatStore | Zustand + persist
streamReply() | async generator of tokens
appendToLast() | one update per token batch
Message list | Markdown + actions
:::

**You'll practise:** a Zustand store with `persist` and `partialize`, async generators, `AbortController`, streaming UI state, auto-scroll, derived titles, search with `useDeferredValue`, and component composition.

## Step 1 — The fake model (swap this for your backend)

The model is an **async generator**: it `yield`s small pieces of text, and stops early if the signal is aborted. Your real version would `fetch("/api/chat")` and yield parsed SSE events.

```js run title="Step 1 · streamReply"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function* streamReply(messages, signal) {
  const last = messages.at(-1).content.toLowerCase();
  let reply = `You asked about "${messages.at(-1).content}". This is a demo model — connect your backend to get real answers.`;
  if (last.includes("rag")) reply = "**RAG** (retrieval-augmented generation) means: search your documents first, then give the best passages to the model as context, so answers are grounded and can cite sources.";
  for (const piece of reply.match(/\S+\s*/g)) {
    if (signal?.aborted) return;
    await sleep(30);
    yield piece;
  }
}

// try it
let text = "";
for await (const piece of streamReply([{ role: "user", content: "what is rag?" }])) text += piece;
console.log(text);
```

## Step 2 — The complete app

```jsx run title="AI Chat · complete app"
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// ============ 1. fake streaming model (replace with fetch("/api/chat") + readSSE) ============
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REPLIES = [
  [/rag|retriev/, "**RAG** (retrieval-augmented generation) has three steps:\n\n1. **Retrieve** the passages most similar to the question\n2. **Augment** the prompt with them\n3. **Generate** an answer that cites them\n\nIt keeps answers grounded in *your* documents."],
  [/code|python|react|example/, "Here's a tiny example of calling a backend from React:\n\n```js\nconst res = await fetch(\"/api/chat\", {\n  method: \"POST\",\n  body: JSON.stringify({ messages }),\n});\n```\n\nThe server holds the API key and streams tokens back."],
  [/hello|hi\b|hey/, "Hi! 👋 I'm a **demo model** running in your browser. Ask me about `RAG`, ask for a code example, or try the **Stop** and **Regenerate** buttons."],
];
async function* streamReply(messages, signal) {
  const q = messages.at(-1).content;
  const match = REPLIES.find(([re]) => re.test(q.toLowerCase()));
  const variants = match ? [match[1]] : [
    `Good question! You asked: *"${q}"*. In a real app, this text would stream from your model through your backend.`,
    `Let me think about *"${q}"*… This demo can't really answer, but notice how the text **streams** in, and how you can stop it at any time.`,
  ];
  const reply = variants[messages.filter((m) => m.role === "assistant").length % variants.length];
  for (const piece of reply.match(/\S+\s*|\n+/g)) {
    if (signal.aborted) return;
    await sleep(25 + Math.random() * 40);
    yield piece;
  }
}

// ============ 2. the store: conversations + persistence ============
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const makeChat = () => ({ id: newId(), title: "New chat", messages: [], updatedAt: Date.now() });

const useChatStore = create(persist((set, get) => {
  const updateActive = (fn) => set((s) => ({
    chats: s.chats.map((c) => (c.id === s.activeId ? { ...fn(c), updatedAt: Date.now() } : c)),
  }));
  const first = makeChat();
  return {
    chats: [first],
    activeId: first.id,
    streaming: false,                                         // not persisted (see partialize)
    newChat: () => {
      const existingEmpty = get().chats.find((c) => c.messages.length === 0);
      if (existingEmpty) return set({ activeId: existingEmpty.id });
      const chat = makeChat();
      set((s) => ({ chats: [chat, ...s.chats], activeId: chat.id }));
    },
    select: (id) => set({ activeId: id }),
    remove: (id) => set((s) => {
      const chats = s.chats.filter((c) => c.id !== id);
      if (chats.length === 0) chats.push(makeChat());
      return { chats, activeId: s.activeId === id ? chats[0].id : s.activeId };
    }),
    addMessage: (role, content) => updateActive((c) => ({
      ...c,
      title: c.messages.length === 0 && role === "user" ? content.slice(0, 40) : c.title,   // auto-title from first message
      messages: [...c.messages, { id: newId(), role, content }],
    })),
    appendToLast: (text) => updateActive((c) => {
      const last = c.messages.at(-1);
      return { ...c, messages: [...c.messages.slice(0, -1), { ...last, content: last.content + text }] };
    }),
    dropLastAssistant: () => updateActive((c) => ({ ...c, messages: c.messages.at(-1)?.role === "assistant" ? c.messages.slice(0, -1) : c.messages })),
    setStreaming: (streaming) => set({ streaming }),
  };
}, { name: "lab-chat-v1", partialize: (s) => ({ chats: s.chats, activeId: s.activeId }) }));

// ============ 3. the streaming hook ============
function useSend() {
  const controllerRef = useRef(null);
  const store = useChatStore;

  async function run() {
    const { chats, activeId, addMessage, appendToLast, setStreaming } = store.getState();
    const history = chats.find((c) => c.id === activeId).messages;
    const controller = new AbortController();
    controllerRef.current = controller;
    addMessage("assistant", "");
    setStreaming(true);
    let buffer = "", frame = 0;
    const flush = () => { if (buffer) { appendToLast(buffer); buffer = ""; } frame = 0; };
    try {
      for await (const piece of streamReply(history, controller.signal)) {
        buffer += piece;
        frame ||= requestAnimationFrame(flush);              // batch tokens: max one update per frame
      }
    } finally {
      cancelAnimationFrame(frame); flush();
      setStreaming(false);
    }
  }
  return {
    send: (text) => { store.getState().addMessage("user", text); return run(); },
    regenerate: () => { store.getState().dropLastAssistant(); return run(); },
    stop: () => controllerRef.current?.abort(),
  };
}

// ============ 4. a small, safe Markdown renderer ============
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong>
    : part.startsWith("`") ? <code key={i}>{part.slice(1, -1)}</code>
    : part.startsWith("*") && part.length > 2 ? <em key={i}>{part.slice(1, -1)}</em>
    : part);
}
function Markdown({ text }) {
  const parts = text.split(/```(\w*)\n?([\s\S]*?)(?:```|$)/g);   // [text, lang, code, text, ...]
  const out = [];
  for (let i = 0; i < parts.length; i += 3) {
    parts[i].split(/\n{2,}/).filter((p) => p.trim()).forEach((para, j) => {
      const lines = para.split("\n");
      if (lines.every((l) => /^(\d+\.|[-*]) /.test(l))) {
        const Tag = /^\d/.test(lines[0]) ? "ol" : "ul";
        out.push(<Tag key={`${i}-${j}`}>{lines.map((l, k) => <li key={k}>{inline(l.replace(/^(\d+\.|[-*]) /, ""))}</li>)}</Tag>);
      } else out.push(<p key={`${i}-${j}`} style={{ margin: "0 0 8px" }}>{inline(para)}</p>);
    });
    if (parts[i + 2] !== undefined) out.push(<CodeBlock key={`c${i}`} lang={parts[i + 1]} code={parts[i + 2].replace(/\n$/, "")} />);
  }
  return out;
}
function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => { navigator.clipboard?.writeText(code).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
        style={{ position: "absolute", right: 6, top: 6, padding: "1px 8px", fontSize: 12 }} aria-label="Copy code">{copied ? "✓" : "Copy"}</button>
      <pre><code>{code}</code></pre>
    </div>
  );
}

// ============ 5. UI components ============
function Sidebar() {
  const chats = useChatStore((s) => s.chats);
  const activeId = useChatStore((s) => s.activeId);
  const { newChat, select, remove } = useChatStore.getState();
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const shown = [...chats]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((c) => !deferredQ || c.title.toLowerCase().includes(deferredQ.toLowerCase()) || c.messages.some((m) => m.content.toLowerCase().includes(deferredQ.toLowerCase())));
  return (
    <aside className="stack chat-side">
      <button className="primary" onClick={newChat}>＋ New chat</button>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats" />
      <nav className="stack chat-list" style={{ gap: 2 }}>
        {shown.map((c) => (
          <div key={c.id} className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
            <button onClick={() => select(c.id)} aria-current={c.id === activeId}
              style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "5px 8px",
                background: c.id === activeId ? "color-mix(in srgb, var(--accent) 18%, transparent)" : "transparent", borderColor: "transparent" }}>
              💬 {c.title}
            </button>
            <button aria-label={`Delete ${c.title}`} onClick={() => remove(c.id)} style={{ padding: "4px 6px", borderColor: "transparent", background: "transparent" }}>×</button>
          </div>
        ))}
        {shown.length === 0 && <small className="muted">No matches</small>}
      </nav>
    </aside>
  );
}

function MessageList({ onRegenerate }) {
  const chat = useChatStore((s) => s.chats.find((c) => c.id === s.activeId));
  const streaming = useChatStore((s) => s.streaming);
  const endRef = useRef(null);
  const boxRef = useRef(null);
  const last = chat.messages.at(-1);

  useEffect(() => {                                       // auto-scroll only if the user is near the bottom
    const box = boxRef.current;
    if (box.scrollHeight - box.scrollTop - box.clientHeight < 120) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [last?.content, chat.id]);

  return (
    <div ref={boxRef} className="stack" style={{ height: 300, overflowY: "auto", paddingRight: 4 }}>
      {chat.messages.length === 0 && (
        <div className="stack" style={{ margin: "auto", textAlign: "center" }}>
          <div style={{ fontSize: 30 }}>✨</div>
          <b>How can I help?</b>
          <span className="muted">Try “hello”, “what is RAG?” or “show me a code example”.</span>
        </div>
      )}
      {chat.messages.map((m, i) => {
        const isLast = i === chat.messages.length - 1;
        return m.role === "user" ? (
          <div key={m.id} className="card" style={{ alignSelf: "flex-end", maxWidth: "80%", background: "var(--accent)", color: "white", whiteSpace: "pre-wrap" }}>{m.content}</div>
        ) : (
          <div key={m.id} style={{ maxWidth: "92%" }}>
            <div className="card">
              {m.content ? <Markdown text={m.content} /> : <span className="muted">Thinking…</span>}
              {streaming && isLast && <span className="cursor">▍</span>}
            </div>
            {!(streaming && isLast) && (
              <div className="row" style={{ gap: 4, marginTop: 4 }}>
                <button style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => navigator.clipboard?.writeText(m.content).catch(() => {})}>⧉ Copy</button>
                {isLast && <button style={{ padding: "2px 8px", fontSize: 12 }} onClick={onRegenerate}>↻ Regenerate</button>}
              </div>
            )}
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

function Composer({ onSend, onStop }) {
  const streaming = useChatStore((s) => s.streaming);
  const [text, setText] = useState("");
  const ref = useRef(null);
  useEffect(() => { ref.current.style.height = "auto"; ref.current.style.height = Math.min(ref.current.scrollHeight, 120) + "px"; }, [text]);
  function submit() {
    if (!text.trim() || streaming) return;
    onSend(text.trim());
    setText("");
  }
  return (
    <div className="row" style={{ alignItems: "flex-end", flexWrap: "nowrap" }}>
      <textarea ref={ref} rows={1} value={text} onChange={(e) => setText(e.target.value)} aria-label="Message"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
        placeholder="Message the assistant…" style={{ flex: 1, resize: "none" }} />
      {streaming ? <button onClick={onStop}>■ Stop</button> : <button className="primary" onClick={submit} disabled={!text.trim()}>Send</button>}
    </div>
  );
}

// side-by-side on wide screens, stacked on phones
const LAYOUT_CSS = `
  .chat-shell { display: flex; gap: 12px; align-items: stretch; }
  .chat-side { width: 180px; flex-shrink: 0; border-right: 1px solid var(--border); padding-right: 10px; }
  .chat-list { max-height: 330px; overflow-y: auto; }
  @media (max-width: 560px) {
    .chat-shell { flex-direction: column; }
    .chat-side { width: auto; border-right: 0; padding-right: 0; }
    .chat-list { max-height: 96px; }
  }`;

export default function App() {
  const { send, regenerate, stop } = useSend();
  return (
    <div className="chat-shell">
      <style>{LAYOUT_CSS}</style>
      <Sidebar />
      <main className="stack" style={{ flex: 1, minWidth: 0 }}>
        <MessageList onRegenerate={regenerate} />
        <Composer onSend={send} onStop={stop} />
      </main>
    </div>
  );
}
```

Things to try: start several chats and switch between them, search your chats, stop an answer half-way, regenerate, and reload the preview — conversations are saved.

## Making it real

Replace `streamReply` with a function that calls your backend and yields text — the rest of the app doesn't change:

```js
async function* streamReply(messages, signal) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: messages.map(({ role, content }) => ({ role, content })) }),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  for await (const event of readSSE(res)) {            // from the Streaming Chat lesson
    if (event.type === "text") yield event.text;
    if (event.type === "error") throw new Error(event.message);
  }
}
```

The `/api/chat` route from the *Streaming Chat UIs* lesson already streams Claude's answer in exactly that format.

## How it works

| Piece | Why it's built this way |
|---|---|
| **Zustand store** with `persist` | conversations are shared by sidebar, list and composer; `partialize` saves chats but not the transient `streaming` flag |
| `updateActive(fn)` helper | every message change goes through one immutable update of the active chat |
| **async generator** model | a clean seam: fake or real, the UI just does `for await (const piece of …)` |
| `requestAnimationFrame` batching | tokens can arrive faster than 60 fps; we update state at most once per frame |
| `AbortController` | Stop cancels the request (and, with a real backend, the model stream) |
| conditional auto-scroll | follows the stream only if you're already at the bottom |
| `useDeferredValue` search | typing in search stays smooth even with many chats |
| responsive layout | a `<style>` tag with a media query: sidebar beside the chat on wide screens, above it on phones |

:::exercise Extend it
1. Add **edit & resend** for user messages (drop everything after it and call `run()`).
2. Add a **model picker** stored per chat and send it to the backend.
3. Show **token usage** from the final `done` event under each answer.
4. Add **file attachments**: read text files with `file.text()` and include them in the prompt.
5. Move conversations to a server with **TanStack Query**, keeping only UI state in Zustand.
:::

:::keypoints
- A store holds conversations; components subscribe to just what they need.
- The model is an async generator — swapping fake for real is a one-function change.
- Batch streamed tokens per animation frame; abort with `AbortController`; auto-scroll politely.
- Persist only durable data (`partialize`); derive titles and search results.
:::
