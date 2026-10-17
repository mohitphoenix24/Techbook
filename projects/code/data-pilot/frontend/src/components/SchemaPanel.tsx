import type { SchemaTable } from "../types";

export function SchemaPanel({ tables }: { tables: SchemaTable[] }) {
  return (
    <aside className="schema" aria-label="Database schema">
      <h2>The shop database</h2>
      <p className="muted small">What the agent can see. It cannot change anything: the connection is read-only.</p>
      {tables.map((t) => (
        <details key={t.table}>
          <summary><b>{t.table}</b> <span className="muted">{t.rows} rows</span></summary>
          <p className="muted small">{t.description}</p>
          <ul>{t.columns.map((c) => <li key={c.name}><code>{c.name}</code> <span className="muted">{c.type.toLowerCase()}</span></li>)}</ul>
        </details>
      ))}
    </aside>
  );
}
