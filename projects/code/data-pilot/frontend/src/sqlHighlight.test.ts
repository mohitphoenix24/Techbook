import { describe, expect, it } from "vitest";
import { tokenize } from "./sqlHighlight";

describe("tokenize", () => {
  it("tells keywords, strings and numbers apart", () => {
    const t = tokenize("SELECT name FROM orders WHERE status = 'sent' LIMIT 5");
    expect(t.filter((x) => x.kind === "keyword").map((x) => x.text)).toEqual(["SELECT", "FROM", "WHERE", "LIMIT"]);
    expect(t.filter((x) => x.kind === "string").map((x) => x.text)).toEqual(["'sent'"]);
    expect(t.filter((x) => x.kind === "number").map((x) => x.text)).toEqual(["5"]);
  });
  it("does not mistake column names for keywords, and keeps all the text", () => {
    const sql = "SELECT o.status, COUNT(*) AS n -- how many\nFROM orders o";
    const t = tokenize(sql);
    expect(t.map((x) => x.text).join("")).toBe(sql);
    expect(t.find((x) => x.text.includes("status"))!.kind).toBe("plain");
    expect(t.find((x) => x.kind === "comment")!.text).toBe("-- how many");
  });
  it("keeps a quote inside a string and treats keywords case-insensitively", () => {
    expect(tokenize("select 'it''s'").map((x) => [x.text, x.kind]).filter(([, k]) => k !== "plain")).toEqual([["select", "keyword"], ["'it''s'", "string"]]);
  });
});
