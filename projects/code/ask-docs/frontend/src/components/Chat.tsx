import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Turn } from "../askReducer";
import type { AskSettings, DocumentInfo, Mode } from "../types";
import { Answer } from "./Answer";
import { SourceCard } from "./SourceCard";

const EXAMPLES = ["How many days of annual leave do I get?", "Are the earbuds waterproof?", "What is the late fee if I pay my bill late?", "What is the capital of France?"];

interface Props {
  turns: Turn[];
  busy: boolean;
  ready: DocumentInfo[];
  settings: AskSettings;
  onSettings: (s: AskSettings) => void;
  onAsk: (q: string) => void;
  onStop: () => void;
  onClear: () => void;
  onOpen: (chunkId: number) => void;
}

// region: turn
function TurnView({ turn, details, onOpen }: { turn: Turn; details: boolean; onOpen: (id: number) => void }) {
  const [flash, setFlash] = useState<number | null>(null);
  const [open, setOpen] = useState(true);                            // the sources panel can be collapsed
  const root = useRef<HTMLDivElement>(null);

  function cite(n: number) {                                         // a citation chip opens the panel and scrolls to its source
    setOpen(true);
    setTimeout(() => root.current?.querySelector(`#source-${n}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 0);
    setFlash(n);
    setTimeout(() => setFlash(null), 1400);
  }

  return (
    <div className="turn" ref={root} data-status={turn.status}>
      <div className="question">{turn.question}</div>
      {turn.standalone && <p className="rewrite muted">Searched for: “{turn.standalone}”</p>}
      <Answer turn={turn} onCite={cite} />
      {turn.relevant && turn.sources.length > 0 && (
        <details className="sources" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary>{turn.sources.length} sources</summary>
          <div className="source-list">
            {turn.sources.map((s) => (
              <SourceCard key={s.n} source={s} query={turn.standalone ?? turn.question} cited={!!turn.citations?.used.includes(s.n)} flash={flash === s.n} details={details} onOpen={onOpen} />
            ))}
          </div>
        </details>
      )}
      {turn.usage && turn.usage.input_tokens > 0 && <p className="usage muted">{turn.usage.input_tokens} in · {turn.usage.output_tokens} out · ${turn.usage.cost_usd.toFixed(4)}</p>}
    </div>
  );
}

// endregion: turn

export function Chat({ turns, busy, ready, settings, onSettings, onAsk, onStop, onClear, onOpen }: Props) {
  const [text, setText] = useState("");
  const [details, setDetails] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [turns.length, turns[turns.length - 1]?.answer.length]);

  function submit() {
    const q = text.trim();
    if (!q || busy) return;
    onAsk(q);
    setText("");
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } };

  return (
    <section className="chat">
      <div className="thread" role="log" aria-live="polite">
        {turns.length === 0 && (
          <div className="welcome">
            <h2>Ask your documents</h2>
            <p className="muted">{ready.length ? "Answers come only from your documents, with a number you can click to see the source." : "Load some documents on the left to begin."}</p>
            {ready.length > 0 && <div className="chips">{EXAMPLES.map((q) => <button key={q} className="chip" onClick={() => onAsk(q)}>{q}</button>)}</div>}
          </div>
        )}
        {turns.map((t) => <TurnView key={t.id} turn={t} details={details} onOpen={onOpen} />)}
        <div ref={end} />
      </div>

      <footer className="composer">
        <div className="box">
          <textarea value={text} rows={1} aria-label="Question" placeholder={ready.length ? "Ask a question about your documents…" : "Add a document first"} disabled={!ready.length}
            onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
          {busy ? <button className="stop" onClick={onStop}>■ Stop</button> : <button className="primary" onClick={submit} disabled={!text.trim() || !ready.length}>Ask</button>}
        </div>
        <div className="options">
          <label>Search
            <select value={settings.mode} onChange={(e) => onSettings({ ...settings, mode: e.target.value as Mode })}>
              <option value="hybrid">hybrid (recommended)</option><option value="vector">meaning only (vector)</option><option value="keyword">words only (keyword)</option>
            </select>
          </label>
          <label>Passages
            <input type="range" min={1} max={8} value={settings.topK} onChange={(e) => onSettings({ ...settings, topK: Number(e.target.value) })} /> {settings.topK}
          </label>
          <label className="check"><input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} /> Retrieval details</label>
          {turns.length > 0 && <button className="link" onClick={onClear}>Clear chat</button>}
        </div>
      </footer>
    </section>
  );
}
