import type { HistoryItem } from "../types";

interface Props {
  items: HistoryItem[];
  activeId: string | null;
  names: Record<string, string>;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export function History({ items, activeId, names, onOpen, onDelete }: Props) {
  return (
    <aside className="history" aria-label="History">
      <h3>History</h3>
      {items.length === 0 && <p className="muted small">Your extractions will appear here.</p>}
      <ul>
        {items.map((item) => (
          <li key={item.id} className={item.id === activeId ? "active" : ""}>
            <button className="open" onClick={() => onOpen(item.id)}>
              <span className="kind">{names[item.doc_type] ?? item.doc_type}</span>
              <span className="preview">{item.preview}</span>
              <span className="badges">
                {!item.valid && <em className="bad">needs review</em>}
                {item.reviewed && <em className="ok">reviewed</em>}
              </span>
            </button>
            <button className="icon" aria-label="Delete this extraction" onClick={() => onDelete(item.id)}>✕</button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
