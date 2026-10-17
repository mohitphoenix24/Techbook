import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { ApiError, deleteExtraction, extract, getDocTypes, getExtraction, getHealth, listHistory, saveReview, uploadForText } from "./api";
import { FormContext } from "./components/FieldForm";
import { History } from "./components/History";
import { ResultPanel } from "./components/ResultPanel";
import { SourcePanel } from "./components/SourcePanel";
import { initialState, isEdited, reducer } from "./extractorReducer";
import type { DocTypeInfo, HistoryItem } from "./types";

// region: app
export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [docTypes, setDocTypes] = useState<DocTypeInfo[]>([]);
  const [provider, setProvider] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const refreshHistory = useCallback(() => { listHistory().then(setHistory).catch(() => {}); }, []);

  useEffect(() => {
    getDocTypes().then((types) => { setDocTypes(types); dispatch({ type: "pickType", id: types[0].id }); }).catch((e: Error) => dispatch({ type: "failed", message: e.message }));
    getHealth().then((h) => setProvider(h.provider)).catch(() => {});
    refreshHistory();
  }, [refreshHistory]);

  const doc = docTypes.find((d) => d.id === state.docTypeId);
  const names = useMemo(() => Object.fromEntries(docTypes.map((d) => [d.id, d.name])), [docTypes]);

  async function runExtract() {
    dispatch({ type: "extracting" });
    const sourceText = state.text;
    try {
      const result = await extract(state.docTypeId, sourceText, state.mistake);
      dispatch({ type: "extracted", result, sourceText });
      refreshHistory();
    } catch (e) {
      dispatch({ type: "failed", message: e instanceof ApiError ? e.message : "Something went wrong." });
    }
  }

  // endregion: app

  async function upload(file: File) {
    setUploadError(null);
    try {
      dispatch({ type: "setText", text: (await uploadForText(file)).text });
    } catch (e) {
      setUploadError(e instanceof ApiError ? e.message : "Upload failed.");
    }
  }

  async function save() {
    if (!state.result || !state.data) return;
    setSaving(true);
    try {
      const { data } = await saveReview(state.result.id, state.data);
      dispatch({ type: "saved", data });
      refreshHistory();
    } catch (e) {
      dispatch({ type: "saveFailed", issues: e instanceof ApiError ? e.issues : [], message: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  async function open(id: string) {
    const record = await getExtraction(id);
    dispatch({ type: "pickType", id: record.doc_type });
    dispatch({ type: "extracted", result: record.result, sourceText: record.source_text, reviewed: record.reviewed });
  }

  async function remove(id: string) {
    await deleteExtraction(id);
    if (state.result?.id === id) dispatch({ type: "pickType", id: state.docTypeId });
    refreshHistory();
  }

  const ctx: Omit<FormContext, "issues" | "evidence"> = {
    onChange: (path, value) => dispatch({ type: "edit", path, value }),
    onRemove: (listPath, index) => dispatch({ type: "removeItem", listPath, index }),
    onFocus: (path) => dispatch({ type: "focus", path }),
  };

  const evidence = state.result && state.extractedText === state.text ? state.result.grounding : null;

  return (
    <div className="app">
      <header className="topbar">
        <h1>Smart Extractor</h1>
        <nav className="types" aria-label="Document type">
          {docTypes.map((d) => (
            <button key={d.id} className={d.id === state.docTypeId ? "on" : ""} title={d.description} onClick={() => dispatch({ type: "pickType", id: d.id })}>{d.name}</button>
          ))}
        </nav>
        <span className="pill">{provider === "mock" ? "Offline demo model" : provider ? "Claude" : ""}</span>
      </header>

      <div className="layout">
        <main className="workspace">
          {doc && (
            <SourcePanel
              text={state.text} samples={doc.samples} busy={state.status === "extracting"} mock={provider === "mock"} mistake={state.mistake}
              evidence={evidence} focusPath={state.focusPath} uploadError={uploadError}
              onText={(text) => dispatch({ type: "setText", text })} onMistake={(mistake) => dispatch({ type: "setMistake", mistake })}
              onUpload={upload} onExtract={runExtract}
            />
          )}
          {state.status === "error" && !state.result && <p className="msg error panel" role="alert">{state.error}</p>}
          {doc && state.result && state.data ? (
            <ResultPanel
              doc={doc} result={state.result} data={state.data} reviewIssues={state.reviewIssues} edited={isEdited(state)} saved={state.saved}
              saving={saving} error={state.error} ctx={ctx} onSave={save}
            />
          ) : (
            <section className="panel placeholder">
              <h2>{doc?.name ?? "Result"}</h2>
              <p className="muted">{doc?.description}</p>
              <p className="muted">Load a sample on the left and press <b>Extract</b>. You will get a form where every value is checked against the rules and against the document.</p>
            </section>
          )}
        </main>
        <History items={history} activeId={state.result?.id ?? null} names={names} onOpen={open} onDelete={remove} />
      </div>
    </div>
  );
}
