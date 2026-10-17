import { useCallback, useMemo, useState } from "react";
import { Chat } from "./components/Chat";
import { Library } from "./components/Library";
import { SourceViewer } from "./components/SourceViewer";
import type { AskSettings, DocumentInfo } from "./types";
import { useAsk } from "./useAsk";

export default function App() {
  const [docs, setDocs] = useState<DocumentInfo[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());     // documents the person switched OFF; new ones are on
  const [mode, setMode] = useState<AskSettings["mode"]>("hybrid");
  const [topK, setTopK] = useState(5);
  const [viewing, setViewing] = useState<number | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const ready = useMemo(() => docs.filter((d) => d.status === "ready"), [docs]);
  const active = useMemo(() => new Set(ready.filter((d) => !excluded.has(d.id)).map((d) => d.id)), [ready, excluded]);
  const settings: AskSettings = useMemo(
    () => ({ mode, topK, documentIds: excluded.size === 0 ? null : [...active] }),      // null = search everything
    [mode, topK, excluded, active],
  );
  const { state, ask, stop, clear } = useAsk(settings);

  const toggle = useCallback((id: string) => {
    setExcluded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className={`app ${libraryOpen ? "library-open" : ""}`}>
      <header className="topbar">
        <button className="icon menu" aria-label="Show documents" onClick={() => setLibraryOpen((v) => !v)}>☰</button>
        <h1>AskDocs</h1>
        <span className="muted">{ready.length} document{ready.length === 1 ? "" : "s"} ready</span>
      </header>
      <Library selected={active} onToggle={toggle} onDocuments={setDocs} />
      <Chat
        turns={state.turns} busy={state.busy} ready={ready} settings={settings}
        onSettings={(s) => { setMode(s.mode); setTopK(s.topK); }}
        onAsk={ask} onStop={stop} onClear={clear} onOpen={setViewing}
      />
      {viewing !== null && <SourceViewer chunkId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
