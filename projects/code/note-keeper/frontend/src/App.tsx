import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { applyProposal, getHealth, getNote, getNotes, getProposals, rejectProposal } from "./api";
import { ExchangeView } from "./components/ExchangeView";
import { NoteViewer } from "./components/NoteViewer";
import { Sidebar } from "./components/Sidebar";
import type { NoteInfo, Proposal } from "./types";
import { useChat } from "./useChat";

const EXAMPLES = [
  "What are my action items from the product sync?",
  "Which note mentions the water supply?",
  "Add a note about the water cut from the landlord's email to the meeting notes",
  "Create a note called weekend-plans with three ideas from my trip ideas",
  "Summarise the pasted email",
];

export default function App() {
  const [notes, setNotes] = useState<NoteInfo[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [open, setOpen] = useState<{ name: string; content: string } | null>(null);
  const [health, setHealth] = useState<{ model: string; has_key: boolean } | null>(null);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  const reload = useCallback(() => {
    getNotes().then(setNotes).catch(() => {});
    getProposals().then(setProposals).catch(() => {});
  }, []);
  const { state, send, stop, clear } = useChat(reload);

  useEffect(() => { reload(); getHealth().then(setHealth).catch(() => {}); }, [reload]);
  const lastX = state.exchanges[state.exchanges.length - 1];
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [state.exchanges.length, lastX?.steps.length, lastX?.status]);

  function submit(message = text) {
    const m = message.trim();
    if (!m || state.busy) return;
    send(m);
    setText("");
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } };

  // region: decide
  const decide = (action: typeof applyProposal) => async (id: number) => {
    await action(id);                 // a failure (for example a stale proposal) throws, and the card shows the server's reason
    reload();
  };
  // endregion: decide

  return (
    <div className="app">
      <header className="topbar">
        <h1>NoteKeeper</h1>
        {health && <span className="pill">{health.model}</span>}
      </header>
      {health && !health.has_key && (
        <div className="banner" role="alert">
          <b>No API key.</b> NoteKeeper talks to the real Claude, so it needs one. Put <code>ANTHROPIC_API_KEY=…</code> in <code>backend/.env</code> and restart the server.
        </div>
      )}
      <Sidebar notes={notes} proposals={proposals} onOpen={(name) => getNote(name).then(setOpen).catch(() => {})} onApply={decide(applyProposal)} onReject={decide(rejectProposal)} />
      <main className="chat">
        <div className="thread" role="log" aria-live="polite">
          {state.exchanges.length === 0 && (
            <div className="welcome">
              <h2>Ask your notes anything</h2>
              <p className="muted">NoteKeeper reads and searches your notes. When it wants to change one, it proposes the change and you decide.</p>
              <div className="chips">{EXAMPLES.map((q) => <button key={q} className="chip" onClick={() => submit(q)}>{q}</button>)}</div>
            </div>
          )}
          {state.exchanges.map((x) => <ExchangeView key={x.id} x={x} />)}
          <div ref={end} />
        </div>
        <footer className="composer">
          <div className="box">
            <textarea value={text} rows={1} aria-label="Message" placeholder="Ask about your notes, or ask for a change…" onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
            {state.busy ? <button className="stop" onClick={stop}>■ Stop</button> : <button className="primary" onClick={() => submit()} disabled={!text.trim()}>Send</button>}
          </div>
          {state.exchanges.length > 0 && <div className="options"><button className="link" onClick={clear}>Clear chat</button></div>}
        </footer>
      </main>
      {open && <NoteViewer name={open.name} content={open.content} onClose={() => setOpen(null)} />}
    </div>
  );
}
