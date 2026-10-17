import type { ConversationSummary } from "../types";

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export function Sidebar({ conversations, activeId, onNew, onOpen, onDelete }: Props) {
  return (
    <aside className="sidebar">
      <button className="new-chat" onClick={onNew}>＋ New chat</button>
      <nav aria-label="Conversations">
        {conversations.length === 0 && <p className="muted small">Your chats will appear here.</p>}
        <ul>
          {conversations.map((c) => (
            <li key={c.id} className={c.id === activeId ? "active" : ""}>
              <button className="conv" onClick={() => onOpen(c.id)} title={c.title}>{c.title}</button>
              <button className="icon-btn del" aria-label={`Delete ${c.title}`} onClick={() => onDelete(c.id)}>✕</button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
