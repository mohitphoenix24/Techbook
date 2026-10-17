import { describe, expect, it } from "vitest";
import { share, usd } from "./format";

describe("format", () => {
  it("shows small dollar amounts with enough digits", () => {
    expect([usd(0.0021), usd(0.5)]).toEqual(["$0.0021", "$0.500"]);
  });

  it("turns scores into bar widths relative to the best, never so thin they vanish", () => {
    expect([share(10, 10), share(5, 10), share(0.1, 10), share(3, 0)]).toEqual([100, 50, 4, 0]);
  });
});
