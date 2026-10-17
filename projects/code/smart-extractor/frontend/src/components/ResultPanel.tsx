import { download, toCsv } from "../export";
import { groupIssues } from "../paths";
import type { Data, DocTypeInfo, ExtractionResult, Issue } from "../types";
import { FieldForm, type FormContext } from "./FieldForm";

interface Props {
  doc: DocTypeInfo;
  result: ExtractionResult;
  data: Data;
  reviewIssues: Issue[];
  edited: boolean;
  saved: boolean;
  saving: boolean;
  error: string | null;
  ctx: Omit<FormContext, "issues" | "evidence">;
  onSave: () => void;
}

const money = (usd: number) => (usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`);

// region: banner
function Banner({ result }: { result: ExtractionResult }) {
  const warnings = result.issues.filter((i) => i.level === "warning").length;
  if (!result.valid) {
    return <div className="banner bad" role="status"><b>✕ Needs your review.</b> After {result.attempts} attempts the answer still breaks the rules below. Fix the fields, then save.</div>;
  }
  if (warnings) {
    return <div className="banner warn" role="status"><b>⚠ {warnings} value{warnings > 1 ? "s" : ""} not found in the document.</b> They pass every rule but cannot be traced to the text. Check them against the source.</div>;
  }
  return (
    <div className="banner ok" role="status">
      <b>✓ Valid and traceable.</b> {result.attempts > 1 ? `Fixed automatically after ${result.attempts - 1} retr${result.attempts > 2 ? "ies" : "y"}.` : "Right first time."}
    </div>
  );
}
// endregion: banner

export function ResultPanel({ doc, result, data, reviewIssues, edited, saved, saving, error, ctx, onSave }: Props) {
  const issues = groupIssues([...result.issues.filter((i) => !(edited && i.level === "warning")), ...reviewIssues]);
  const wholeDocument = issues[""] ?? [];

  return (
    <section className="panel result-panel" aria-label="Extracted data">
      <div className="panel-head">
        <h2>{doc.name}</h2>
        <span className="meta" title="Tokens in / out, estimated price, time">
          {result.usage.input_tokens} in · {result.usage.output_tokens} out · {money(result.usage.cost_usd)} · {result.duration_ms} ms · {result.provider === "mock" ? "offline model" : result.model}
        </span>
      </div>

      <Banner result={result} />
      {wholeDocument.map((i) => <p className="msg error" key={i.message}>{i.message}</p>)}
      {error && <p className="msg error" role="alert">{error}</p>}

      <FieldForm fields={doc.fields} value={data} path="" ctx={{ ...ctx, issues, evidence: result.grounding }} />

      <div className="actions">
        <button onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))}>Copy JSON</button>
        <button onClick={() => download(`${doc.id}.json`, JSON.stringify(data, null, 2), "application/json")}>Download JSON</button>
        <button onClick={() => download(`${doc.id}.csv`, toCsv(data), "text/csv")}>Download CSV</button>
        <button className="primary" onClick={onSave} disabled={saving || (saved && !edited)} title="Save your review: your answers become test cases for the extractor">
          {saved && !edited ? "✓ Review saved" : saving ? "Saving…" : edited ? "Save corrections" : "Confirm as correct"}
        </button>
      </div>
    </section>
  );
}
