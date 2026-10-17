import type { TreeEntry } from "./types";

// region: tree
export interface TreeNode {
  name: string;
  path: string;              // the full path: for a folder, the folder's path
  folder: boolean;
  lines?: number;
  children: TreeNode[];
}

/** Turn a flat list of file paths into nested folders, folders first, each level sorted by name. */
export function buildTree(entries: TreeEntry[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", folder: true, children: [] };
  for (const entry of entries) {
    let node = root;
    const parts = entry.path.split("/");
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/");
      let child = node.children.find((c) => c.name === part && c.folder === (i < parts.length - 1));
      if (!child) {
        child = { name: part, path, folder: i < parts.length - 1, lines: i === parts.length - 1 ? entry.lines : undefined, children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes.sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name)).map((n) => ({ ...n, children: sort(n.children) }));
  return sort(root.children);
}

/** The folders that must be open to show a file: "a/b/c.py" -> ["a", "a/b"]. */
export function ancestors(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}
// endregion: tree
