import { describe, expect, it } from "vitest";
import { highlightTerms, queryTerms } from "./highlight";

describe("queryTerms", () => {
  it("drops short and common words", () => {
    expect(queryTerms("How many days of annual leave do I get?")).toEqual(["days", "annual", "leave", "get"]);
  });
});

describe("highlightTerms", () => {
  it("marks words that start like a query word, in any case", () => {
    const marked = highlightTerms("Leaves are credited monthly. Annual LEAVE is 24 days.", "annual leave").filter((p) => p.hit).map((p) => p.text);
    expect(marked).toEqual(["Leaves", "Annual", "LEAVE"]);
  });

  it("keeps all the original text, in order", () => {
    const text = "You get 24 days (paid) of leave.";
    expect(highlightTerms(text, "days of leave").map((p) => p.text).join("")).toBe(text);
  });

  it("marks nothing when there are no useful terms", () => {
    expect(highlightTerms("anything at all", "is it").some((p) => p.hit)).toBe(false);
  });
});
