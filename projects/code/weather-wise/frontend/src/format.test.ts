import { describe, expect, it } from "vitest";
import { degrees, describeInput, inlineParts, rainLevel, rangeBars, shortDate } from "./format";
import type { Day } from "./types";

const day = (min: number | null, max: number | null): Day => ({ date: "2026-10-18", weekday: "Sun", summary: "Clear sky", kind: "clear", temp_min: min, temp_max: max, rain_mm: 0, rain_chance: 0, wind_max: 10, uv_max: 5 });

describe("rangeBars", () => {
  it("places each day's range between the coldest and warmest point of the whole forecast", () => {
    const bars = rangeBars([day(10, 20), day(15, 30), day(20, 30)]);
    expect(bars[0]).toEqual({ left: 0, width: 50 });
    expect(bars[1]).toEqual({ left: 25, width: 75 });
    expect(bars[2]).toEqual({ left: 50, width: 50 });
  });

  it("keeps a day with no spread visible and inside the track", () => {
    const [flat, wide] = rangeBars([day(30, 30), day(10, 30)]);
    expect(flat!.width).toBe(4);
    expect(flat!.left + flat!.width).toBeLessThanOrEqual(100);
    expect(wide).toEqual({ left: 0, width: 100 });
  });

  it("copes with missing numbers and a one-day forecast", () => {
    expect(rangeBars([day(null, null), day(null, 20)])).toEqual([null, null]);
    expect(rangeBars([])).toEqual([]);
    expect(rangeBars([day(20, 30)])[0]!.width).toBeGreaterThan(0);
  });
});

describe("labels", () => {
  it("rounds degrees and shows a dash for a missing value", () => {
    expect(degrees(33.3)).toBe("33°");
    expect(degrees(-0.4)).toBe("0°");                 // never "-0°"
    expect(degrees(-3.6)).toBe("-4°");
    expect(degrees(null)).toBe("–");
  });

  it("names the rain level", () => {
    expect([null, 0, 9, 10, 39, 40, 69, 70, 100].map(rainLevel)).toEqual(["none", "none", "none", "low", "low", "mid", "mid", "high", "high"]);
  });

  it("formats a date without touching time zones", () => {
    expect(shortDate("2026-10-23")).toBe("23 Oct");
    expect(shortDate("2027-01-05")).toBe("5 Jan");
  });

  it("describes tool inputs for the step list", () => {
    expect(describeInput("find_place", { name: "Pune", country_code: "IN" })).toBe("Pune, IN");
    expect(describeInput("find_place", { name: "Goa" })).toBe("Goa");
    expect(describeInput("get_forecast", { place_id: 1, days: 5 })).toBe("5 days");
    expect(describeInput("get_forecast", { place_id: 1 })).toBe("3 days");
  });
});

describe("inlineParts", () => {
  it("splits bold and code out of plain text", () => {
    expect(inlineParts("Take an **umbrella** on `Monday`.")).toEqual([
      { kind: "text", text: "Take an " }, { kind: "bold", text: "umbrella" }, { kind: "text", text: " on " }, { kind: "code", text: "Monday" }, { kind: "text", text: "." },
    ]);
  });

  it("leaves everything else alone, including HTML", () => {
    expect(inlineParts("<b onclick=x>hi</b> 2 * 3 * 4")).toEqual([{ kind: "text", text: "<b onclick=x>hi</b> 2 * 3 * 4" }]);
  });
});
