import { blankFor } from "../paths";
import type { Evidence, FieldNode, Issue } from "../types";

// region: ctx
export interface FormContext {
  issues: Record<string, Issue[]>;
  evidence: Record<string, Evidence>;
  onChange: (path: string, value: unknown) => void;
  onRemove: (listPath: string, index: number) => void;
  onFocus: (path: string | null) => void;
}

/** What do we know about this value? One word the row can show: error, warning, found, or nothing. */
function statusOf(path: string, ctx: FormContext): "error" | "warning" | "found" | "none" {
  const issues = ctx.issues[path] ?? [];
  if (issues.some((i) => i.level === "error")) return "error";
  if (issues.length || ctx.evidence[path]?.status === "missing") return "warning";
  return ctx.evidence[path]?.status === "found" ? "found" : "none";
}
// endregion: ctx

const CHIP = { error: "✕ Rule broken", warning: "⚠ Not in the document", found: "✓ In the document", none: "" } as const;

function Input({ node, value, path, ctx }: { node: FieldNode; value: unknown; path: string; ctx: FormContext }) {
  const set = (v: unknown) => ctx.onChange(path, v);
  const common = { id: `f-${path}`, "aria-label": node.label, onFocus: () => ctx.onFocus(path) };
  switch (node.type) {
    case "number":
      return <input {...common} type="number" step="any" value={value as number} onChange={(e) => set(e.target.value === "" ? 0 : Number(e.target.value))} />;
    case "date":
      return <input {...common} type="date" value={(value as string) ?? ""} onChange={(e) => set(e.target.value || null)} />;
    case "boolean":
      return <input {...common} type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} />;
    case "enum":
      return <select {...common} value={value as string} onChange={(e) => set(e.target.value)}>{node.options!.map((o) => <option key={o}>{o}</option>)}</select>;
    default: {
      const text = (value as string) ?? "";
      return text.length > 60
        ? <textarea {...common} rows={3} value={text} onChange={(e) => set(e.target.value)} />
        : <input {...common} value={text} onChange={(e) => set(e.target.value)} />;
    }
  }
}

// region: row
function Row({ node, value, path, ctx }: { node: FieldNode; value: unknown; path: string; ctx: FormContext }) {
  const status = statusOf(path, ctx);
  const messages = ctx.issues[path] ?? [];

  if (node.type === "object") {
    return <FieldForm fields={node.fields!} value={value as Record<string, unknown>} path={path} ctx={ctx} />;
  }

  if (node.type === "list") {
    const items = (value as unknown[]) ?? [];
    return (
      <section className="list" aria-label={node.label}>
        <h4>{node.label} <span className="count">{items.length}</span></h4>
        {items.map((item, i) => (
          <div className={`item ${statusOf(`${path}.${i}`, ctx)}`} key={i}>
            <header>
              <span>#{i + 1}</span>
              <button className="link" onClick={() => ctx.onRemove(path, i)} aria-label={`Remove ${node.label} ${i + 1}`}>Remove</button>
            </header>
            {(ctx.issues[`${path}.${i}`] ?? []).map((m) => <p className="msg" key={m.message}>{m.message}</p>)}
            <Row node={{ ...node.item!, label: node.label }} value={item} path={`${path}.${i}`} ctx={ctx} />
          </div>
        ))}
        <button className="add" onClick={() => ctx.onChange(path, [...items, blankFor(node.item!)])}>＋ Add {node.label.toLowerCase().replace(/s$/, "")}</button>
      </section>
    );
  }

  return (
    <div className={`field ${status}`} onMouseEnter={() => ctx.onFocus(path)} onMouseLeave={() => ctx.onFocus(null)}>
      <label htmlFor={`f-${path}`}>{node.label}</label>
      <div className="control">
        {value === null ? (
          <span className="empty">Not in the document <button className="link" onClick={() => ctx.onChange(path, blankFor(node))}>Add a value</button></span>
        ) : (
          <>
            <Input node={node} value={value} path={path} ctx={ctx} />
            {node.nullable && <button className="icon" title="This document does not say: clear it" aria-label={`Clear ${node.label}`} onClick={() => ctx.onChange(path, null)}>✕</button>}
          </>
        )}
        {status !== "none" && <span className={`chip ${status}`}>{CHIP[status]}</span>}
      </div>
      {messages.map((m) => <p className={`msg ${m.level}`} key={m.message}>{m.message}</p>)}
    </div>
  );
}
// endregion: row

// region: form
/** Draw a form from a field description and the current data. No document type is hard-coded here. */
export function FieldForm({ fields, value, path, ctx }: { fields: FieldNode[]; value: Record<string, unknown>; path: string; ctx: FormContext }) {
  return (
    <div className="form">
      {fields.map((node) => (
        <Row key={node.name} node={node} value={value?.[node.name]} path={path ? `${path}.${node.name}` : node.name} ctx={ctx} />
      ))}
    </div>
  );
}
// endregion: form
