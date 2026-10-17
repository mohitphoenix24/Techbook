import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type DragEvent } from "react";
import { deleteDocument, getHealth, listDocuments, loadSamples, reindex, uploadDocuments } from "../api";
import type { DocumentInfo } from "../types";

interface Props {
  selected: Set<string>;                       // documents the questions are limited to
  onToggle: (id: string) => void;
  onDocuments: (docs: DocumentInfo[]) => void;
}

const LABEL: Record<DocumentInfo["status"], string> = { queued: "Waiting…", parsing: "Reading…", embedding: "Embedding", ready: "Ready", failed: "Failed" };

export function Library({ selected, onToggle, onDocuments }: Props) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["documents"] });

  // region: polling
  const documents = useQuery({
    queryKey: ["documents"],
    queryFn: async () => { const docs = await listDocuments(); onDocuments(docs); return docs; },
    // While anything is still being processed, ask again every 700 ms. When all are done, stop polling.
    refetchInterval: (query) => (query.state.data?.some((d) => d.status !== "ready" && d.status !== "failed") ? 700 : false),
  });
  // endregion: polling
  const health = useQuery({ queryKey: ["health"], queryFn: getHealth });

  // region: mutations
  const upload = useMutation({ mutationFn: uploadDocuments, onSuccess: () => { setError(null); refresh(); }, onError: (e: Error) => setError(e.message) });
  const samples = useMutation({ mutationFn: loadSamples, onSuccess: refresh });
  const remove = useMutation({ mutationFn: deleteDocument, onSuccess: refresh });
  const rebuild = useMutation({ mutationFn: reindex, onSuccess: () => { refresh(); queryClient.invalidateQueries({ queryKey: ["health"] }); } });
  // endregion: mutations

  // region: drop
  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const files = [...e.dataTransfer.files];
    if (files.length) upload.mutate(files);
  }
  // endregion: drop

  const docs = documents.data ?? [];
  return (
    <aside className="library" aria-label="Documents">
      <h2>Your documents</h2>

      <div
        className={`drop ${over ? "over" : ""}`} role="button" tabIndex={0} aria-label="Upload documents"
        onClick={() => fileInput.current?.click()} onKeyDown={(e) => e.key === "Enter" && fileInput.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}
      >
        <b>Drop files here</b> or click to choose
        <small>.pdf, .txt or .md</small>
        <input ref={fileInput} type="file" multiple accept=".pdf,.txt,.md,.markdown" hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) upload.mutate(f); e.target.value = ""; }} />
      </div>
      {error && <p className="flag error" role="alert">{error}</p>}

      {docs.length === 0 && !documents.isLoading && (
        <div className="empty">
          <p className="muted">No documents yet. Upload your own, or try the three samples (an HR handbook, a product FAQ and broadband terms).</p>
          <button className="primary" onClick={() => samples.mutate()} disabled={samples.isPending}>Load sample documents</button>
        </div>
      )}

      <ul>
        {docs.map((d) => (
          <li key={d.id} className={d.status}>
            <label>
              <input type="checkbox" checked={selected.has(d.id)} disabled={d.status !== "ready"} onChange={() => onToggle(d.id)} aria-label={`Search ${d.title}`} />
              <span className="title" title={d.title}>{d.title}</span>
            </label>
            <span className="meta">
              {d.status === "ready" ? `${d.n_chunks} passages${d.pages > 1 ? ` · ${d.pages} pages` : ""}` : d.status === "failed" ? d.error : LABEL[d.status]}
            </span>
            {(d.status === "embedding" || d.status === "parsing" || d.status === "queued") && <progress value={d.progress} max={1} aria-label="Progress" />}
            <button className="icon" aria-label={`Delete ${d.title}`} onClick={() => remove.mutate(d.id)}>✕</button>
          </li>
        ))}
      </ul>

      {!!health.data?.stale_chunks && (
        <div className="notice">
          <p>{health.data.stale_chunks} passages were embedded with a different model and cannot be searched yet.</p>
          <button onClick={() => rebuild.mutate()} disabled={rebuild.isPending}>{rebuild.isPending ? "Re-indexing…" : "Re-index"}</button>
        </div>
      )}
      {health.data && <p className="foot muted">Answers: {health.data.provider === "mock" ? "offline model" : health.data.model} · Search: {health.data.embedder}</p>}
    </aside>
  );
}
