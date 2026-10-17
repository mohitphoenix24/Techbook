import { describe, expect, it } from "vitest";
import { formatCell, indian, sortRows, toCsv } from "./format";

describe("indian", () => {
  it("groups digits the Indian way", () => {
    expect([0, 999, 1000, 211881, 3217610, 12345678, -4500].map(indian)).toEqual(["0", "999", "1,000", "2,11,881", "32,17,610", "1,23,45,678", "-4,500"]);
    expect(indian(1234.5)).toBe("1,234.50");
  });
});

describe("formatCell", () => {
  it("puts a rupee sign on money columns only", () => {
    expect(formatCell(211881, "revenue")).toBe("₹2,11,881");
    expect(formatCell(4861.6, "avg_order_value")).toBe("₹4,861.60");
    expect(formatCell(31, "orders")).toBe("31");
    expect(formatCell(7.5, "cancelled_pct")).toBe("7.5");
    expect(formatCell(null, "x")).toBe("—");
    expect(formatCell("Mumbai", "city")).toBe("Mumbai");
  });
});

describe("toCsv", () => {
  it("quotes commas and quotes", () => {
    expect(toCsv(["name", "n"], [["Asha, Rao", 1], ['say "hi"', null]])).toBe('name,n\n"Asha, Rao",1\n"say ""hi""",');
  });
});

describe("sortRows", () => {
  const rows = [["b", 10], ["a", 2], ["c", null], ["d", 33]] as (string | number | null)[][];
  it("sorts numbers as numbers and keeps empty cells last, in both directions", () => {
    expect(sortRows(rows, 1, "asc").map((r) => r[0])).toEqual(["a", "b", "d", "c"]);
    expect(sortRows(rows, 1, "desc").map((r) => r[0])).toEqual(["d", "b", "a", "c"]);
    expect(sortRows(rows, 0, "asc").map((r) => r[0])).toEqual(["a", "b", "c", "d"]);
  });
  it("does not change the original array", () => {
    const copy = JSON.stringify(rows);
    sortRows(rows, 1, "desc");
    expect(JSON.stringify(rows)).toBe(copy);
  });
});
