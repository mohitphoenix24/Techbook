import { describe, expect, it } from "vitest";
import { arc, bars, compact, linePoints, niceMax, slices, ticks } from "./chart";

const box = { width: 400, height: 200, left: 40, right: 10, top: 10, bottom: 30 };

describe("scales", () => {
  it("rounds the top of an axis up to a tidy number", () => {
    expect([0.7, 1, 1.4, 3, 7, 83, 4146, 211881].map(niceMax)).toEqual([1, 1, 2, 5, 10, 100, 5000, 500000]);
    expect(niceMax(0)).toBe(1);
  });
  it("makes evenly spaced ticks from zero to the tidy top", () => {
    expect(ticks(83, 4)).toEqual([0, 25, 50, 75, 100]);
  });
  it("abbreviates in lakh and crore", () => {
    expect([950, 1250, 125000, 1250000, 25000000].map(compact)).toEqual(["950", "1.3k", "1.3L", "12.5L", "2.5Cr"]);
  });
});

describe("bars and lines", () => {
  it("scales bars to the tidy maximum and keeps them inside the plot", () => {
    const [a, b] = bars([50, 100], box);
    expect(b.h).toBeCloseTo(160);                         // plot height = 200 - 10 - 30; 100 is the tidy top
    expect(a.h).toBeCloseTo(80);
    expect(b.y).toBeCloseTo(10);
    expect(a.x).toBeGreaterThan(box.left);
  });
  it("places line points from the left to the right edge of the plot", () => {
    const pts = linePoints([0, 50, 100], box);
    expect(pts[0].x).toBeCloseTo(40); expect(pts[2].x).toBeCloseTo(390);
    expect(pts[0].y).toBeGreaterThan(pts[2].y);           // bigger value, higher up the screen (smaller y)
  });
  it("copes with one point and with nothing", () => {
    expect(linePoints([5], box)).toHaveLength(1);
    expect(bars([], box)).toEqual([]);
  });
});

describe("pie", () => {
  it("turns values into fractions that add up to one, biggest first", () => {
    const s = slices([["a", 1], ["b", 3], ["c", 0]]);
    expect(s.map((x) => x.label)).toEqual(["b", "a"]);
    expect(s.reduce((t, x) => t + x.fraction, 0)).toBeCloseTo(1);
  });
  it("merges the smallest slices into Other", () => {
    const s = slices(Array.from({ length: 10 }, (_, i) => [`p${i}`, 10 - i] as [string, number]), 4);
    expect(s).toHaveLength(5);
    expect(s[4]).toMatchObject({ label: "Other", value: 6 + 5 + 4 + 3 + 2 + 1 });
  });
  it("draws a half circle with the large-arc flag off and a three-quarter slice with it on", () => {
    expect(arc(50, 50, 40, 0, 0.5)).toContain("A40 40 0 0 1");
    expect(arc(50, 50, 40, 0, 0.75)).toContain("A40 40 0 1 1");
  });
});
