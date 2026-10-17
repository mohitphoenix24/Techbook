import { useRef, useState } from "react";
import type { Evidence, Mistake, Sample } from "../types";
import { Highlighted } from "./Highlighted";

interface Props {
  text: string;
  samples: Sample[];
  busy: boolean;
  mock: boolean;
  mistake: Mistake;
  evidence: Record<string, Evidence> | null;       // null until there is a result for exactly this text
  focusPath: string | null;
  onText: (text: string) => void;
  onMistake: (m: Mistake) => void;
  onUpload: (file: File) => void;
  onExtract: () => void;
  uploadError: string | null;
}

export function SourcePanel({ text, samples, busy, mock, mistake, evidence, focusPath, onText, onMistake, onUpload, onExtract, uploadError }: Props) {
  const [tab, setTab] = useState<"text" | "evidence">("text");
  const file = useRef<HTMLInputElement>(null);
  const showEvidence = tab === "evidence" && evidence !== null;

  return (
    <section className="panel source-panel" aria-label="Document">
      <div className="panel-head">
        <h2>Document</h2>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={!showEvidence} className={!showEvidence ? "on" : ""} onClick={() => setTab("text")}>Text</button>
          <button role="tab" aria-selected={showEvidence} className={showEvidence ? "on" : ""} disabled={evidence === null} onClick={() => setTab("evidence")} title={evidence ? "" : "Extract first, then see where each value came from"}>Evidence</button>
        </div>
      </div>

      <div className="toolbar">
        <select aria-label="Load a sample" value="" onChange={(e) => { const s = samples.find((x) => x.id === e.target.value); if (s) { onText(s.text); setTab("text"); } }}>
          <option value="">Load a sample…</option>
          {samples.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        <button onClick={() => file.current?.click()}>Upload .txt / .pdf</button>
        <input ref={file} type="file" accept=".txt,.md,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; setTab("text"); }} />
      </div>
      {uploadError && <p className="msg error" role="alert">{uploadError}</p>}

      {showEvidence ? (
        <>
          <Highlighted text={text} evidence={evidence!} focusPath={focusPath} />
          <p className="legend"><mark>highlighted</mark> = the text a value was found in. Hover a field to jump to its evidence.</p>
        </>
      ) : (
        <textarea className="source" aria-label="Document text" value={text} placeholder="Paste a document here, load a sample, or upload a file…" onChange={(e) => onText(e.target.value)} />
      )}

      <div className="actions">
        {mock && (
          <label className="mistake" title="Offline model only: pretend the model made a mistake so you can watch the safety nets work">
            Simulate a mistake
            <select value={mistake} onChange={(e) => onMistake(e.target.value as Mistake)}>
              <option value="none">None</option>
              <option value="rule">Breaks a rule (repaired)</option>
              <option value="invent">Invents a value (flagged)</option>
            </select>
          </label>
        )}
        <button className="primary" onClick={onExtract} disabled={busy || !text.trim()}>{busy ? "Extracting…" : "Extract"}</button>
      </div>
    </section>
  );
}
