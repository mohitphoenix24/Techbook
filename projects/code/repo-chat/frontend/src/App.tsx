import { useCallback, useEffect, useMemo, useState } from "react";
import { getTree, listRepos } from "./api";
import { Chat } from "./components/Chat";
import { FileTree } from "./components/FileTree";
import { FileViewer } from "./components/FileViewer";
import { RepoBar } from "./components/RepoBar";
import type { Range } from "./ranges";
import type { RepoSummary, TreeEntry } from "./types";
import { useAsk } from "./useAsk";

type Tab = "chat" | "files" | "code";

// region: app
export default function App() {
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [repoId, setRepoId] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [file, setFile] = useState<{ path: string; ranges: Range[] } | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [provider, setProvider] = useState("");
  const [expand, setExpand] = useState(true);
  const [simulate, setSimulate] = useState("none");
  const options = useMemo(() => ({ expand, simulate }), [expand, simulate]);
  const { state, ask, stop, clear } = useAsk(repoId, options);

  const refresh = useCallback(async (select?: string) => {
    const list = await listRepos().catch(() => []);
    setRepos(list);
    setRepoId((current) => select ?? (list.some((r) => r.id === current) ? current : list[0]?.id ?? null));
  }, []);

  useEffect(() => { void refresh(); fetch("/api/health").then((r) => r.json()).then((h) => setProvider(h.provider)).catch(() => {}); }, [refresh]);
  useEffect(() => { setFile(null); clear(); if (repoId) getTree(repoId).then(setTree).catch(() => setTree([])); }, [repoId]);        // eslint-disable-line react-hooks/exhaustive-deps

  const open = (path: string, start?: number, end?: number) => { setFile({ path, ranges: start ? [[start, end ?? start]] : [] }); setTab("code"); };
  const current = repos.find((r) => r.id === repoId) ?? null;

  return (
    <div className="shell">
      <header className="topbar">
        <h1>RepoChat</h1>
        <RepoBar repos={repos} current={current} onSelect={setRepoId} onChanged={refresh} />
        {provider && <span className="pill">{provider === "mock" ? "Offline demo model" : "Claude"}</span>}
      </header>
      <nav className="tabs" aria-label="Panels">
        {(["chat", "files", "code"] as Tab[]).map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "chat" ? "Chat" : t === "files" ? "Files" : "Code"}</button>)}
      </nav>
      <div className={`panes tab-${tab}`}>
        <aside className="pane files"><FileTree entries={tree} selected={file?.path ?? null} onOpen={(p) => open(p)} /></aside>
        <div className="pane chatpane">
          <Chat turns={state.turns} busy={state.busy} provider={provider} expand={expand} simulate={simulate} onExpand={setExpand} onSimulate={setSimulate} onAsk={ask} onStop={stop} onClear={clear} onOpen={open} />
        </div>
        <aside className="pane code">{repoId && <FileViewer repoId={repoId} path={file?.path ?? null} ranges={file?.ranges ?? []} onClose={() => setFile(null)} />}</aside>
      </div>
    </div>
  );
}
// endregion: app
