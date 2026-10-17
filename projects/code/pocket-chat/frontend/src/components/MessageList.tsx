import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types";
import { MessageBubble } from "./MessageBubble";

const SUGGESTIONS = [
  "Hello! What can you do?",
  "Write a small Python function",
  "Give me a plan to learn FastAPI",
  "Compare React and FastAPI in a table",
];

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  onRegenerate: () => void;
  onPick: (text: string) => void;
}

// region: autoscroll
/** Follow the newest text, but stop following the moment the user scrolls up to read. */
function useStickToBottom(dep: unknown) {
  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [dep]);

  const onScroll = () => {
    const el = scroller.current!;
    stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  return { scroller, onScroll };
}
// endregion: autoscroll

export function MessageList({ messages, streaming, onRegenerate, onPick }: Props) {
  const last = messages[messages.length - 1];
  const { scroller, onScroll } = useStickToBottom(last?.content.length ?? 0);

  if (messages.length === 0) {
    return (
      <div className="empty">
        <h2>How can I help?</h2>
        <p className="muted">Try one of these, or type your own message.</p>
        <div className="chips">
          {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => onPick(s)}>{s}</button>)}
        </div>
      </div>
    );
  }

  return (
    <div className="messages" ref={scroller} onScroll={onScroll} role="log" aria-live="polite">
      <div className="thread">
        {messages.map((m, i) => (
          <MessageBubble key={m.id} message={m} isLast={i === messages.length - 1} busy={streaming} onRegenerate={onRegenerate} />
        ))}
      </div>
    </div>
  );
}
