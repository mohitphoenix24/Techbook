import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { getHealth } from "./api";
import { ExchangeView } from "./components/ExchangeView";
import { useChat } from "./useChat";

const EXAMPLES = [
  "Do I need an umbrella in Pune this week?",
  "Compare Mumbai and Delhi for the weekend",
  "I am travelling to Goa on Friday. What should I pack?",
  "Is tomorrow a good day for a run in Bengaluru?",
];

export default function App() {
  const [health, setHealth] = useState<{ model: string; has_key: boolean } | null>(null);
  const [text, setText] = useState("");
  const { state, send, stop, clear } = useChat();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { getHealth().then(setHealth).catch(() => {}); }, []);
  const lastX = state.exchanges[state.exchanges.length - 1];
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [state.exchanges.length, lastX?.steps.length, lastX?.status]);

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
        <h1>WeatherWise</h1>
        {health && <span className="pill">{health.model}</span>}
        <span className="pill soft">forecasts by Open-Meteo</span>
      </header>
      {health && !health.has_key && (
        <div className="banner" role="alert">
          <b>No API key.</b> WeatherWise talks to the real Claude, so it needs one. Put <code>ANTHROPIC_API_KEY=…</code> in <code>backend/.env</code> and restart the server.
        </div>
      )}
      <main className="chat">
        <div className="thread" role="log" aria-live="polite">
          {state.exchanges.length === 0 && (
            <div className="welcome">
              <h2>Ask about the weather anywhere</h2>
              <p className="muted">WeatherWise looks places up, fetches a real forecast and tells you what to wear or carry. Ask about several places and it checks them all at once.</p>
              <div className="chips">{EXAMPLES.map((q) => <button key={q} className="chip" onClick={() => submit(q)}>{q}</button>)}</div>
            </div>
          )}
          {state.exchanges.map((x) => <ExchangeView key={x.id} x={x} />)}
          <div ref={end} />
        </div>
        <footer className="composer">
          <div className="box">
            <textarea value={text} rows={1} aria-label="Message" placeholder="Where are you going, and when?" onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
            {state.busy ? <button className="stop" onClick={stop}>■ Stop</button> : <button className="primary" onClick={() => submit()} disabled={!text.trim()}>Ask</button>}
          </div>
          {state.exchanges.length > 0 && <div className="options"><button className="link" onClick={clear}>Clear chat</button></div>}
        </footer>
      </main>
    </div>
  );
}
