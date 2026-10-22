import { describe, expect, it } from "vitest";
import { answerParts, domainOf, money, plural, safeHref } from "./format";

describe("safeHref", () => {
  it("allows web links", () => {
    expect(safeHref("https://en.wikipedia.org/wiki/Pune")).toBe("https://en.wikipedia.org/wiki/Pune");
    expect(safeHref("http://example.com")).toBe("http://example.com/");
  });

  it("refuses anything that could run code or leave the web", () => {
    for (const bad of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x", "file:///etc/passwd", "//evil.example", "not a url", ""]) {
      expect(safeHref(bad)).toBeNull();
    }
  });
});

describe("domainOf", () => {
  it("shows the site, without www", () => {
    expect(domainOf("https://www.britannica.com/biography/Claude-Shannon")).toBe("britannica.com");
    expect(domainOf("https://en.wikipedia.org/wiki/X")).toBe("en.wikipedia.org");
    expect(domainOf("nonsense")).toBe("");
  });
});

describe("answerParts", () => {
  it("separates text, bold and citation markers", () => {
    expect(answerParts("Pune has **7.4 million** people[1]. Growth is fast[2][1].", 2)).toEqual([
      { kind: "text", text: "Pune has " }, { kind: "bold", text: "7.4 million" }, { kind: "text", text: " people" }, { kind: "cite", n: 1 },
      { kind: "text", text: ". Growth is fast" }, { kind: "cite", n: 2 }, { kind: "cite", n: 1 }, { kind: "text", text: "." },
    ]);
  });

  it("treats a marker for a source that does not exist as plain text", () => {
    expect(answerParts("See [3] and [0].", 2)).toEqual([{ kind: "text", text: "See " }, { kind: "text", text: "[3]" }, { kind: "text", text: " and " }, { kind: "text", text: "[0]" }, { kind: "text", text: "." }]);
    expect(answerParts("An array a[1] in code.", 0).every((p) => p.kind === "text")).toBe(true);
  });

  it("never turns the model's text into markup", () => {
    expect(answerParts("<img src=x onerror=alert(1)>", 0)).toEqual([{ kind: "text", text: "<img src=x onerror=alert(1)>" }]);
    expect(answerParts("", 3)).toEqual([]);
  });
});

describe("labels", () => {
  it("formats money and counts", () => {
    expect(money(0.0123)).toBe("$0.012");
    expect(money(0.5)).toBe("$0.50");
    expect(plural(1, "search")).toBe("1 search");
    expect(plural(3, "tool")).toBe("3 tools");
    expect(plural(2, "search", "searches")).toBe("2 searches");
    expect(plural(0, "page")).toBe("0 pages");
  });
});
