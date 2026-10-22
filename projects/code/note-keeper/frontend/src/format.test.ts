import { describe, expect, it } from "vitest";
import { describeInput, diffLines, diffStats, formatSize, inlineParts } from "./format";

const DIFF = "--- ideas.md\n+++ ideas.md\n@@ -1,3 +1,3 @@\n # Ideas\n - a\n-- b\n+- c\n";

describe("diffLines", () => {
  it("tells the kinds of line apart", () => {
    expect(diffLines(DIFF)).toEqual([
      { kind: "meta", text: "--- ideas.md" }, { kind: "meta", text: "+++ ideas.md" }, { kind: "hunk", text: "@@ -1,3 +1,3 @@" },
      { kind: "ctx", text: "# Ideas" }, { kind: "ctx", text: "- a" }, { kind: "del", text: "- b" }, { kind: "add", text: "- c" },
    ]);
  });

  it("is not fooled by a note line that itself starts with dashes or plus signs", () => {
    const lines = diffLines("--- x.md\n+++ x.md\n@@ -1 +1 @@\n--- a rule\n+++ a heading\n");
    expect(lines.map((l) => l.kind)).toEqual(["meta", "meta", "hunk", "del", "add"]);
    expect(lines[3].text).toBe("-- a rule");
  });

  it("reads a new note and a deleted note", () => {
    expect(diffLines("--- (new note)\n+++ x.md\n@@ -0,0 +1 @@\n+hello\n").map((l) => l.kind)).toEqual(["meta", "meta", "hunk", "add"]);
    expect(diffLines("")).toEqual([]);
  });

  it("counts what a diff adds and removes", () => {
    expect(diffStats(DIFF)).toEqual({ added: 1, removed: 1 });
    expect(diffStats("")).toEqual({ added: 0, removed: 0 });
  });
});

describe("labels", () => {
  it("describes tool inputs for the step list", () => {
    expect(describeInput("read_note", { name: "recipes" })).toBe("recipes");
    expect(describeInput("search_notes", { query: "rent" })).toBe('"rent"');
    expect(describeInput("propose_change", { action: "append", name: "ideas" })).toBe("append ideas");
    expect(describeInput("list_notes", {})).toBe("");
  });

  it("formats sizes", () => {
    expect(formatSize(21)).toBe("21 chars");
    expect(formatSize(999)).toBe("999 chars");
    expect(formatSize(1460)).toBe("1.5k chars");
  });
});

describe("inlineParts", () => {
  it("splits bold and code out of plain text", () => {
    expect(inlineParts("It is in **recipes**, see `poha`.")).toEqual([
      { kind: "text", text: "It is in " }, { kind: "bold", text: "recipes" }, { kind: "text", text: ", see " }, { kind: "code", text: "poha" }, { kind: "text", text: "." },
    ]);
  });

  it("leaves everything else alone, including HTML", () => {
    expect(inlineParts("<script>alert(1)</script>")).toEqual([{ kind: "text", text: "<script>alert(1)</script>" }]);
  });
});
