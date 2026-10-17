import { describe, expect, it } from "vitest";
import { linkCitations, parseCiteHref } from "./citations";

describe("linkCitations", () => {
  it("turns real citations into links", () => {
    expect(linkCitations("You get 24 days [1]. A note is needed [2][1].", 2)).toBe("You get 24 days [1](#cite-1). A note is needed [2](#cite-2)[1](#cite-1).");
  });

  it("marks citations to sources that do not exist", () => {
    expect(linkCitations("It is 30 days [7].", 3)).toBe("It is 30 days [7](#cite-bad).");
    expect(linkCitations("zero [0]", 3)).toBe("zero [0](#cite-bad)");
  });

  it("leaves text without citations alone", () => {
    expect(linkCitations("Nothing here (see page 2).", 3)).toBe("Nothing here (see page 2).");
  });
});

describe("parseCiteHref", () => {
  it("reads the number, the bad marker, or nothing", () => {
    expect(parseCiteHref("#cite-12")).toBe(12);
    expect(parseCiteHref("#cite-bad")).toBe("bad");
    expect(parseCiteHref("https://example.com")).toBeNull();
    expect(parseCiteHref(undefined)).toBeNull();
  });
});
