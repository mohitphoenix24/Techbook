import { describe, expect, it } from "vitest";
import { label, splitCitations } from "./citations";

describe("splitCitations", () => {
  it("cuts an answer into text and citations and attaches the server's verdict to each", () => {
    const parts = splitCitations("It is in [jobq/retry.py:20-29], not [jobq/ghost.py:1-3].", [
      { path: "jobq/retry.py", start: 20, end: 29, status: "valid" }, { path: "jobq/ghost.py", start: 1, end: 3, status: "no_such_file" },
    ]);
    expect(parts).toEqual([
      { kind: "text", text: "It is in " },
      { kind: "cite", path: "jobq/retry.py", start: 20, end: 29, status: "valid" },
      { kind: "text", text: ", not " },
      { kind: "cite", path: "jobq/ghost.py", start: 1, end: 3, status: "no_such_file" },
      { kind: "text", text: "." },
    ]);
  });

  it("marks citations as unchecked while the answer is still streaming", () => {
    expect(splitCitations("see [a.py:5]", null)[1]).toEqual({ kind: "cite", path: "a.py", start: 5, end: 5, status: "unchecked" });
  });

  it("ignores brackets that are not citations", () => {
    expect(splitCitations("a list [1, 2], a link [docs](x) and [not a path]", null)).toEqual([{ kind: "text", text: "a list [1, 2], a link [docs](x) and [not a path]" }]);
  });

  it("labels a citation by file name and lines", () => {
    expect([label({ path: "jobq/retry.py", start: 20, end: 29 }), label({ path: "a/b.py", start: 7, end: 7 })]).toEqual(["retry.py:20-29", "b.py:7"]);
  });
});
