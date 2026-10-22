import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { getHealth, getTasks, setDone } from "./api";
import { ExchangeView } from "./components/ExchangeView";
import { TaskBoard } from "./components/TaskBoard";
import type { Task } from "./types";
import { useChat } from "./useChat";

const EXAMPLES = [
  "Remind me to pay the electricity bill on Friday, it is urgent",
  "Add three tasks: buy milk, call mum, book train tickets",
  "What is due this week?",
  "Mark the milk task as done",
  "Move my overdue tasks to tomorrow",
];

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<{ model: string; has_key: boolean } | null>(null);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  const reload = useCallback(() => { getTasks().then(setTasks).catch(() => {}).finally(() => setLoading(false)); }, []);
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
  const toggle = (t: Task) => { setDone(t.id, !t.done).then(reload).catch(() => {}); };

  return (
    <div className="app">
      <header className="topbar">
        <h1>TaskPal</h1>
        {health && <span className="pill">{health.model}</span>}
      </header>
      {health && !health.has_key && (
        <div className="banner" role="alert">
          <b>No API key.</b> TaskPal talks to the real Claude, so it needs one. Put <code>ANTHROPIC_API_KEY=…</code> in <code>backend/.env</code> and restart the server.
        </div>
      )}
      <TaskBoard tasks={tasks} onToggle={toggle} loading={loading} />
      <main className="chat">
        <div className="thread" role="log" aria-live="polite">
          {state.exchanges.length === 0 && (
            <div className="welcome">
              <h2>Tell TaskPal what you need</h2>
              <p className="muted">It reads your list, works out dates, and adds, changes or removes tasks. You see every step it takes.</p>
              <div className="chips">{EXAMPLES.map((q) => <button key={q} className="chip" onClick={() => submit(q)}>{q}</button>)}</div>
            </div>
          )}
          {state.exchanges.map((x) => <ExchangeView key={x.id} x={x} />)}
          <div ref={end} />
        </div>
        <footer className="composer">
          <div className="box">
            <textarea value={text} rows={1} aria-label="Message" placeholder="Add, change or ask about your tasks…" onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
            {state.busy ? <button className="stop" onClick={stop}>■ Stop</button> : <button className="primary" onClick={() => submit()} disabled={!text.trim()}>Send</button>}
          </div>
          {state.exchanges.length > 0 && <div className="options"><button className="link" onClick={clear}>Clear chat</button></div>}
        </footer>
      </main>
    </div>
  );
}
