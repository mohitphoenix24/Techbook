import { useRef, useState, type KeyboardEvent } from "react";
import type { Persona } from "../types";

interface Props {
  personas: Persona[];
  persona: string;
  onPersona: (id: string) => void;
  streaming: boolean;
  dropped: number;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function Composer({ personas, persona, onPersona, streaming, dropped, onSend, onStop }: Props) {
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const value = text.trim();
    if (!value || streaming) return;
    onSend(value);
    setText("");
    if (box.current) box.current.style.height = "auto";
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  function grow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }

  return (
    <footer className="composer">
      {dropped > 0 && (
        <p className="notice" role="status">The oldest {dropped} message{dropped > 1 ? "s were" : " was"} left out to fit the model’s memory budget.</p>
      )}
      <div className="composer-box">
        <textarea
          ref={box}
          value={text}
          rows={1}
          placeholder="Message Pocket Chat…  (Enter to send, Shift+Enter for a new line)"
          onChange={(e) => { setText(e.target.value); grow(e.target); }}
          onKeyDown={onKeyDown}
          aria-label="Message"
        />
        {streaming ? (
          <button className="send stop" onClick={onStop} aria-label="Stop generating">■ Stop</button>
        ) : (
          <button className="send" onClick={submit} disabled={!text.trim()} aria-label="Send message">Send ↑</button>
        )}
      </div>
      <div className="composer-row">
        <label className="persona">
          <span>Persona</span>
          <select value={persona} onChange={(e) => onPersona(e.target.value)} disabled={streaming}>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <span className="muted small">{personas.find((p) => p.id === persona)?.blurb}</span>
      </div>
    </footer>
  );
}
