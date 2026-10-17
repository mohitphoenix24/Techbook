import { describe, expect, it } from "vitest";
import { ancestors, buildTree } from "./fileTree";

const entries = [
  { path: "README.md", lines: 51, chunks: 6 }, { path: "jobq/worker.py", lines: 77, chunks: 7 }, { path: "jobq/retry.py", lines: 36, chunks: 5 },
  { path: "tests/test_retry.py", lines: 33, chunks: 6 }, { path: "docs/architecture.md", lines: 26, chunks: 5 }, { path: "zeta.py", lines: 3, chunks: 1 },
];

describe("buildTree", () => {
  it("nests files under folders, folders first, each level sorted", () => {
    const tree = buildTree(entries);
    expect(tree.map((n) => [n.name, n.folder])).toEqual([["docs", true], ["jobq", true], ["tests", true], ["README.md", false], ["zeta.py", false]]);
    expect(tree[1].children.map((n) => n.name)).toEqual(["retry.py", "worker.py"]);
    expect(tree[1].children[0]).toMatchObject({ path: "jobq/retry.py", lines: 36, folder: false });
  });

  it("copes with deep paths and with an empty list", () => {
    expect(buildTree([{ path: "a/b/c/d.py", lines: 1, chunks: 1 }])[0].children[0].children[0].children[0].path).toBe("a/b/c/d.py");
    expect(buildTree([])).toEqual([]);
  });

  it("lists the folders to open to reveal a file", () => {
    expect(ancestors("a/b/c.py")).toEqual(["a", "a/b"]);
    expect(ancestors("README.md")).toEqual([]);
  });
});
