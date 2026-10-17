import { describe, expect, it } from "vitest";
import { toCsv } from "./export";

describe("toCsv", () => {
  it("makes one row per list item and repeats the single values", () => {
    const csv = toCsv({ vendor: "Acme, Inc", total: 30, line_items: [{ description: "Pen", amount: 10 }, { description: 'Book "A"', amount: 20 }] });
    expect(csv.split("\n")).toEqual([
      "vendor,total,line_items.description,line_items.amount",
      '"Acme, Inc",30,Pen,10',
      '"Acme, Inc",30,"Book ""A""",20',
    ]);
  });

  it("makes a single row when there is no list of objects, joining plain lists", () => {
    expect(toCsv({ title: "Sync", attendees: ["Asha", "Ravi"], date: null }).split("\n")).toEqual(["title,attendees,date", "Sync,Asha; Ravi,"]);
  });
});
