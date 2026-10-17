import { describe, expect, it } from "vitest";
import { splitCitations } from "./citations";

describe("splitCitations", () => {
  it("cuts a draft into text and citation chips, marking unknown articles as invalid", () => {
    expect(splitCitations("You can return it [kb:returns]. Refunds take 3 days [kb:made-up].", ["returns"])).toEqual([
      { kind: "text", text: "You can return it " },
      { kind: "cite", id: "returns", valid: true },
      { kind: "text", text: ". Refunds take 3 days " },
      { kind: "cite", id: "made-up", valid: false },
      { kind: "text", text: "." },
    ]);
  });

  it("returns plain text as one part, and nothing for nothing", () => {
    expect(splitCitations("No citations here.", [])).toEqual([{ kind: "text", text: "No citations here." }]);
    expect(splitCitations("", [])).toEqual([]);
  });

  it("ignores brackets that are not citations", () => {
    expect(splitCitations("Order [AUR-1001] and [1]", [])).toHaveLength(1);
  });
});
