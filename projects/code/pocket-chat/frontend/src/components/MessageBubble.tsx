import { useState } from "react";
import type { ChatMessage } from "../types";
import { Markdown } from "./Markdown";

interface Props {
  message: ChatMessage;
  isLast: boolean;
  busy: boolean;
  onRegenerate: () => void;
}

// region: format-cost
export function formatCost(usd: number): string {
  if (usd === 0) return "$0";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}
// endregion: format-cost

export function MessageBubble({ message, isLast, busy, onRegenerate }: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const waiting = message.status === "streaming" && message.content === "";

  async function copy() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <article className={`msg ${message.role}`} aria-label={isUser ? "You" : "Assistant"}>
      <div className="avatar" aria-hidden>{isUser ? "You" : "AI"}</div>
      <div className="bubble">
        {isUser ? (
          <p className="user-text">{message.content}</p>
        ) : waiting ? (
          <span className="typing" aria-label="Assistant is thinking"><i /><i /><i /></span>
        ) : (
          <div className="prose">
            <Markdown text={message.content} />
            {message.status === "streaming" && <span className="caret" aria-hidden />}
          </div>
        )}

        {message.status === "stopped" && <p className="flag">⏹ Stopped. This is a partial answer.</p>}
        {message.status === "error" && (
          <p className="flag error" role="alert">
            ⚠ {message.error}
            {isLast && <button className="link" onClick={onRegenerate}>Try again</button>}
          </p>
        )}

        {!isUser && message.status !== "streaming" && message.content && (
          <footer className="meta">
            <button className="link" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
            {isLast && !busy && <button className="link" onClick={onRegenerate}>↻ Regenerate</button>}
            {message.usage && (
              <span className="usage" title="Tokens read / written, and the estimated price of this reply">
                {message.usage.input_tokens} in · {message.usage.output_tokens} out · {formatCost(message.usage.cost_usd)}
              </span>
            )}
          </footer>
        )}
      </div>
    </article>
  );
}
