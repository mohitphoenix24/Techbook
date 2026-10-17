import { useState } from "react";
import { tokenize } from "../sqlHighlight";

/** A SQL query with colours and a copy button. */
export function Sql({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="sql">
      <button className="copy" onClick={async () => { await navigator.clipboard.writeText(sql); setCopied(true); setTimeout(() => setCopied(false), 1400); }}>{copied ? "Copied ✓" : "Copy"}</button>
      <pre><code>{tokenize(sql).map((t, i) => <span key={i} className={`tk-${t.kind}`}>{t.text}</span>)}</code></pre>
    </div>
  );
}
