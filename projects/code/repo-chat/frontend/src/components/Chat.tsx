import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Turn } from "../chatReducer";
import { usd } from "../format";
import { Answer } from "./Answer";
import { RetrievalPanel } from "./RetrievalPanel";

const SUGGESTIONS = [
  "Where is the retry delay calculated?",
  "How does a worker recover when another worker crashed?",
  "How is a job claimed so two workers never take the same one?",
  "What does Worker._handle_failure do?",
  "Which environment variables configure jobq?",
];

// region: turn
function TurnView({ turn, onOpen }: { turn: Turn; onOpen: (path: string, start: number, end: number) => void }) {
  const flagged = turn.citations?.filter((c) => c.status !== "valid") ?? [];
  return (
    <section className="turn" data-status={turn.status}>
      <div className="question">{turn.question}</div>
      {turn.hits.length > 0 && <RetrievalPanel hits={turn.hits} terms={turn.terms} onOpen={onOpen} />}
      {turn.status === "working" && !turn.text && <p className="muted">Searching the code…</p>}
      {turn.text && <Answer text={turn.text} citations={turn.citations} onOpen={onOpen} />}
      {flagged.length > 0 && (
        <p className="flag" role="status">⚠ {flagged.length} citation{flagged.length === 1 ? "" : "s"} could not be verified: {flagged.map((c) => `${c.path}:${c.start}-${c.end}`).join(", ")}.</p>
      )}
      {turn.status === "stopped" && <p className="flag">⏹ Stopped.</p>}
      {turn.status === "error" && <p className="flag error" role="alert">⚠ {turn.error}</p>}
      {turn.usage && <p className="usage muted small">{turn.usage.input_tokens} in · {turn.usage.output_tokens} out · {usd(turn.usage.cost_usd)}</p>}
    </section>
  );
}
// endregion: turn

export function Chat({ turns, busy, provider, expand, simulate, onExpand, onSimulate, onAsk, onStop, onClear, onOpen }: {
  turns: Turn[]; busy: boolean; provider: string; expand: boolean; simulate: string;
  onExpand: (v: boolean) => void; onSimulate: (v: string) => void; onAsk: (q: string) => void; onStop: () => void; onClear: () => void;
  onOpen: (path: string, start: number, end: number) => void;
}) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [turns.length, turns[turns.length - 1]?.text.length]);

  const submit = (q = text) => { const question = q.trim(); if (question.length >= 3 && !busy) { onAsk(question); setText(""); } };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } };

  return (
    <main className="chat">
      <div className="thread" role="log" aria-live="polite">
        {turns.length === 0 && (
          <div className="welcome">
            <h2>Ask this codebase a question</h2>
            <p className="muted">Answers come from the code itself, and every claim is cited as a file and line range you can click.</p>
            <div className="chips">{SUGGESTIONS.map((q) => <button key={q} className="chip" onClick={() => submit(q)}>{q}</button>)}</div>
          </div>
        )}
        {turns.map((t) => <TurnView key={t.id} turn={t} onOpen={onOpen} />)}
        <div ref={end} />
      </div>
      <footer className="composer">
        <div className="box">
          <textarea value={text} rows={1} aria-label="Question" placeholder="Ask how something works, or where it is…" onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
          {busy ? <button className="stop" onClick={onStop}>■ Stop</button> : <button className="primary" onClick={() => submit()} disabled={text.trim().length < 3}>Ask</button>}
        </div>
        <div className="options small">
          <label><input type="checkbox" checked={expand} onChange={(e) => onExpand(e.target.checked)} /> include the code it calls</label>
          {provider === "mock" && (
            <label>Simulate <select value={simulate} onChange={(e) => onSimulate(e.target.value)}><option value="none">Nothing</option><option value="bad_citation">An answer that cites code that does not exist</option></select></label>
          )}
          {turns.length > 0 && <button className="link" onClick={onClear}>Clear chat</button>}
        </div>
      </footer>
    </main>
  );
}
