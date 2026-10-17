import { describe, expect, it } from "vitest";
import { clampRange, inRanges, mergeRanges } from "./ranges";

describe("ranges", () => {
  it("merges overlapping and touching ranges, in any order", () => {
    expect(mergeRanges([[20, 22], [3, 8], [6, 10], [11, 12]])).toEqual([[3, 12], [20, 22]]);
    expect(mergeRanges([])).toEqual([]);
  });

  it("does not change the ranges it is given", () => {
    const input: [number, number][] = [[1, 3], [2, 5]];
    mergeRanges(input);
    expect(input).toEqual([[1, 3], [2, 5]]);
  });

  it("says whether a line is inside any range, edges included", () => {
    expect([inRanges(3, [[3, 5]]), inRanges(5, [[3, 5]]), inRanges(6, [[3, 5]])]).toEqual([true, true, false]);
  });

  it("keeps a range inside the file, and drops one that is entirely outside it", () => {
    expect(clampRange(0, 90, 50)).toEqual([1, 50]);
    expect(clampRange(10, 20, 50)).toEqual([10, 20]);
    expect(clampRange(60, 70, 50)).toBeNull();
  });
});
