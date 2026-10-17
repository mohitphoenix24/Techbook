import { useRef, useState } from "react";
import { ApiError, deleteRepo, uploadRepo } from "../api";
import type { RepoSummary } from "../types";

// region: repobar
export function RepoBar({ repos, current, onSelect, onChanged }: { repos: RepoSummary[]; current: RepoSummary | null; onSelect: (id: string) => void; onChanged: (select?: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const repo = await uploadRepo(file);
      onChanged(repo.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";             // so choosing the same file again still fires
    }
  }

  async function remove() {
    if (!current || current.builtin) return;
    try { await deleteRepo(current.id); onChanged("sample"); } catch (e) { setError(e instanceof ApiError ? e.message : "Could not remove it."); }
  }

  return (
    <section className="repobar" aria-label="Repository">
      <div className="row">
        <select aria-label="Repository" value={current?.id ?? ""} onChange={(e) => onSelect(e.target.value)}>
          {repos.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button disabled={busy} onClick={() => input.current?.click()}>{busy ? "Indexing…" : "Upload a ZIP"}</button>
        <input ref={input} type="file" accept=".zip,application/zip" hidden aria-label="Upload a repository ZIP" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        {current && !current.builtin && <button className="link" onClick={remove}>Remove</button>}
      </div>
      {current && (
        <p className="muted small" data-testid="repo-stats">
          {current.files} files · {current.chunks} chunks · {current.lines} lines
          {current.skipped > 0 && (
            <details className="skipped"><summary>{current.skipped} skipped</summary><ul>{current.skipped_examples.map((s) => <li key={s.path}><code>{s.path}</code> {s.why}</li>)}</ul></details>
          )}
        </p>
      )}
      {error && <p className="problem" role="alert">{error}</p>}
    </section>
  );
}
// endregion: repobar
