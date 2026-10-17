import { describe, expect, it } from "vitest";
import { blankFor, getAt, groupIssues, isDirty, removeAt, setAt } from "./paths";

const data = { vendor: "Acme", line_items: [{ amount: 10 }, { amount: 20 }] };

describe("getAt / setAt", () => {
  it("reads nested values and the root", () => {
    expect(getAt(data, "line_items.1.amount")).toBe(20);
    expect(getAt(data, "")).toBe(data);
    expect(getAt(data, "nope.deeper")).toBeUndefined();
  });

  it("sets a nested value without mutating the original", () => {
    const next = setAt(data, "line_items.0.amount", 99);
    expect(getAt(next, "line_items.0.amount")).toBe(99);
    expect(data.line_items[0].amount).toBe(10);
    expect(next.line_items[1]).toBe(data.line_items[1]);          // untouched parts are shared, not copied
    expect(Array.isArray(next.line_items)).toBe(true);
  });

  it("removes list items", () => {
    expect(removeAt(data, "line_items", 0).line_items).toEqual([{ amount: 20 }]);
  });
});

describe("groupIssues", () => {
  it("groups by path", () => {
    const issues = [{ path: "total", level: "error" as const, message: "a" }, { path: "total", level: "warning" as const, message: "b" }, { path: "", level: "error" as const, message: "c" }];
    const grouped = groupIssues(issues);
    expect(grouped.total).toHaveLength(2);
    expect(grouped[""][0].message).toBe("c");
  });
});

describe("blankFor", () => {
  it("builds an empty object that matches the description", () => {
    const node = { type: "object", fields: [
      { name: "description", type: "text", nullable: false },
      { name: "quantity", type: "number", nullable: false },
      { name: "due", type: "date", nullable: true },
      { name: "kind", type: "enum", nullable: false, options: ["a", "b"] },
    ] };
    expect(blankFor(node)).toEqual({ description: "", quantity: 0, due: null, kind: "a" });
  });
});

describe("isDirty", () => {
  it("compares by content", () => {
    expect(isDirty({ a: 1 }, { a: 1 })).toBe(false);
    expect(isDirty({ a: 1 }, { a: 2 })).toBe(true);
  });
});
