import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { getHealth } from "./api";
import { ExchangeView } from "./components/ExchangeView";
import { useChat } from "./useChat";

const EXAMPLES = [
  "What is the latest stable version of Python, and what changed in it?",
  "How much does a Claude Opus 5.5 request with 50,000 input tokens and 2,000 output tokens cost?",
  "What are the biggest cities in India by population? Add up the top three.",
  "Who won the most recent Cricket World Cup?",
];

export default function App() {
  const [health, setHealth] = useState<{ model: string; has_key: boolean; max_searches: number } | null>(null);
  const [text, setText] = useState("");
  const { state, send, stop, clear } = useChat();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { getHealth().then(setHealth).catch(() => {}); }, []);
  const lastX = state.exchanges[state.exchanges.length - 1];
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [state.exchanges.length, lastX?.searches.length, lastX?.status]);

  function submit(message = text) {
    const m = message.trim();
    if (!m || state.busy) return;
    send(m);
    setText("");
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } };

  return (
    <div className="app">
      <header className="topbar">
        <h1>ResearchBuddy</h1>
        {health && <span className="pill">{health.model}</span>}
        {health && <span className="pill soft">up to {health.max_searches} searches per question</span>}
      </header>
      {health && !health.has_key && (
        <div className="banner" role="alert">
          <b>No API key.</b> ResearchBuddy talks to the real Claude, so it needs one. Put <code>ANTHROPIC_API_KEY=…</code> in <code>backend/.env</code> and restart the server.
        </div>
      )}
      <main className="chat">
        <div className="thread" role="log" aria-live="polite">
          {state.exchanges.length === 0 && (
            <div className="welcome">
              <h2>Ask a question the web can answer</h2>
              <p className="muted">ResearchBuddy searches, reads, does the sums, and answers with numbered sources you can check. Each search costs one cent.</p>
              <div className="chips">{EXAMPLES.map((q) => <button key={q} className="chip" onClick={() => submit(q)}>{q}</button>)}</div>
            </div>
          )}
          {state.exchanges.map((x) => <ExchangeView key={x.id} x={x} />)}
          <div ref={end} />
        </div>
        <footer className="composer">
          <div className="box">
            <textarea value={text} rows={1} aria-label="Question" placeholder="Ask something that needs a search…" onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
            {state.busy ? <button className="stop" onClick={stop}>■ Stop</button> : <button className="primary" onClick={() => submit()} disabled={!text.trim()}>Ask</button>}
          </div>
          {state.exchanges.length > 0 && <div className="options"><button className="link" onClick={clear}>Clear chat</button></div>}
        </footer>
      </main>
    </div>
  );
}
