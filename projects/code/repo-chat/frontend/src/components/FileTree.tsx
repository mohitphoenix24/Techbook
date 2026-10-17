import { useEffect, useMemo, useState } from "react";
import { ancestors, buildTree, type TreeNode } from "../fileTree";
import type { TreeEntry } from "../types";

// region: tree
export function FileTree({ entries, selected, onOpen }: { entries: TreeEntry[]; selected: string | null; onOpen: (path: string) => void }) {
  const tree = useMemo(() => buildTree(entries), [entries]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => { if (selected) setOpen((o) => new Set([...o, ...ancestors(selected)])); }, [selected]);        // opening a citation reveals its file

  const toggle = (path: string) => setOpen((o) => { const n = new Set(o); n.has(path) ? n.delete(path) : n.add(path); return n; });

  const render = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((n) => (
      <li key={n.path}>
        {n.folder ? (
          <>
            <button className="node folder" style={{ paddingLeft: 8 + depth * 14 }} aria-expanded={open.has(n.path)} onClick={() => toggle(n.path)}>
              <span aria-hidden>{open.has(n.path) ? "▾" : "▸"}</span> {n.name}
            </button>
            {open.has(n.path) && <ul>{render(n.children, depth + 1)}</ul>}
          </>
        ) : (
          <button className={`node file ${selected === n.path ? "on" : ""}`} style={{ paddingLeft: 22 + depth * 14 }} aria-current={selected === n.path} onClick={() => onOpen(n.path)}>
            {n.name} <span className="muted small">{n.lines}</span>
          </button>
        )}
      </li>
    ));

  return <nav className="tree" aria-label="Files"><ul>{render(tree, 0)}</ul></nav>;
}
// endregion: tree
