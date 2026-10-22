import { describe, expect, it } from "vitest";
import { daysBetween, describeInput, dueLabel, groupTasks, inlineParts, localToday } from "./format";
import type { Task } from "./types";

const t = (id: number, due: string | null, done = false): Task => ({ id, title: `task ${id}`, due, priority: "normal", done });

describe("dates", () => {
  it("counts whole days, across month and year ends", () => {
    expect(daysBetween("2026-10-18", "2026-10-19")).toBe(1);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-10-18", "2026-10-11")).toBe(-7);
  });

  it("is not fooled by daylight-saving changes", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("labels due dates the way people say them", () => {
    const today = "2026-10-18";
    expect(dueLabel("2026-10-18", today)).toBe("Today");
    expect(dueLabel("2026-10-19", today)).toBe("Tomorrow");
    expect(dueLabel("2026-10-17", today)).toBe("Yesterday");
    expect(dueLabel("2026-10-23", today)).toBe("Fri 23 Oct");
    expect(dueLabel("2027-01-05", today)).toBe("5 Jan 2027");
  });

  it("formats the local date as YYYY-MM-DD", () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("groupTasks", () => {
  const today = "2026-10-18";
  const tasks = [t(1, "2026-10-10"), t(2, today), t(3, "2026-10-25"), t(4, null), t(5, "2026-10-01", true)];

  it("sorts open tasks into overdue, today, upcoming and no date, and finished ones into done", () => {
    expect(groupTasks(tasks, today).map((g) => [g.key, g.tasks.map((x) => x.id)])).toEqual([
      ["overdue", [1]], ["today", [2]], ["upcoming", [3]], ["someday", [4]], ["done", [5]],
    ]);
  });

  it("leaves out empty sections", () => {
    expect(groupTasks([t(1, null)], today).map((g) => g.key)).toEqual(["someday"]);
    expect(groupTasks([], today)).toEqual([]);
  });

  it("does not call a finished overdue task overdue", () => {
    expect(groupTasks([t(1, "2026-10-01", true)], today).map((g) => g.key)).toEqual(["done"]);
  });
});

describe("describeInput", () => {
  it("summarises tool inputs for the step list", () => {
    expect(describeInput("add_task", { title: "Call mum", due: "2026-10-23", priority: "high" })).toBe("Call mum · due 2026-10-23 · high priority");
    expect(describeInput("add_task", { title: "Milk", priority: "normal" })).toBe("Milk");
    expect(describeInput("update_task", { id: 2, due: null })).toBe("id: 2 · due: none");
    expect(describeInput("delete_task", { id: 4 })).toBe("#4");
    expect(describeInput("get_today", {})).toBe("");
  });
});

describe("inlineParts", () => {
  it("splits bold and code out of plain text", () => {
    expect(inlineParts("Added **Call mum** for `2026-10-23`.")).toEqual([
      { kind: "text", text: "Added " }, { kind: "bold", text: "Call mum" }, { kind: "text", text: " for " }, { kind: "code", text: "2026-10-23" }, { kind: "text", text: "." },
    ]);
  });

  it("leaves everything else alone, including HTML", () => {
    expect(inlineParts("<img src=x onerror=alert(1)> 2 * 3 * 4")).toEqual([{ kind: "text", text: "<img src=x onerror=alert(1)> 2 * 3 * 4" }]);
    expect(inlineParts("")).toEqual([]);
  });
});
