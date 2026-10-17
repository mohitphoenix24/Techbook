import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { getHealth, getSchema } from "./api";
import { SchemaPanel } from "./components/SchemaPanel";
import { TurnView } from "./components/TurnView";
import type { Mistake, SchemaTable } from "./types";
import { useAgent } from "./useAgent";

const EXAMPLES = [
  "Who are the top 5 customers by revenue?",
  "Show revenue by month",
  "How many orders are there by status?",
  "What are the best selling products?",
  "Revenue per category",
  "What is the cancellation rate?",
];

export default function App() {
  const [schema, setSchema] = useState<SchemaTable[]>([]);
  const [provider, setProvider] = useState("");
  const [simulate, setSimulate] = useState<Mistake>("none");
  const [text, setText] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const { state, ask, stop, clear } = useAgent(simulate);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { getSchema().then(setSchema).catch(() => {}); getHealth().then((h) => setProvider(h.provider)).catch(() => {}); }, []);
  const lastTurn = state.turns[state.turns.length - 1];
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [state.turns.length, lastTurn?.steps.length, lastTurn?.status]);

  function submit(question = text) {
    const q = question.trim();
    if (!q || state.busy) return;
    ask(q);
    setText("");
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } };

  return (
    <div className={`app ${panelOpen ? "panel-open" : ""}`}>
      <header className="topbar">
        <button className="icon menu" aria-label="Show the database schema" onClick={() => setPanelOpen((v) => !v)}>☰</button>
        <h1>DataPilot</h1>
        <span className="pill">{provider === "mock" ? "Offline demo model" : provider ? "Claude" : ""}</span>
      </header>
      <SchemaPanel tables={schema} />
      <main className="chat">
        <div className="thread" role="log" aria-live="polite">
          {state.turns.length === 0 && (
            <div className="welcome">
              <h2>Ask your data a question</h2>
              <p className="muted">DataPilot looks at the tables, writes SQL, runs it safely and explains the result. You can see every step.</p>
              <div className="chips">{EXAMPLES.map((q) => <button key={q} className="chip" onClick={() => submit(q)}>{q}</button>)}</div>
            </div>
          )}
          {state.turns.map((t) => <TurnView key={t.id} turn={t} />)}
          <div ref={end} />
        </div>
        <footer className="composer">
          <div className="box">
            <textarea value={text} rows={1} aria-label="Question" placeholder="Ask about customers, orders, products, revenue…" onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
            {state.busy ? <button className="stop" onClick={stop}>■ Stop</button> : <button className="primary" onClick={() => submit()} disabled={!text.trim()}>Ask</button>}
          </div>
          <div className="options">
            {provider === "mock" && (
              <label title="Offline model only: pretend the model wrote a bad query">Simulate a mistake
                <select value={simulate} onChange={(e) => setSimulate(e.target.value as Mistake)}>
                  <option value="none">None</option>
                  <option value="wrong_column">Wrong column (it fixes it)</option>
                  <option value="unsafe">Tries to DELETE (blocked)</option>
                </select>
              </label>
            )}
            {state.turns.length > 0 && <button className="link" onClick={clear}>Clear chat</button>}
          </div>
        </footer>
      </main>
    </div>
  );
}
