import { describe, expect, it } from "vitest";
import type { Span } from "./types";
import { formatMs, layout } from "./waterfall";

const span = (id: number, parent: number | null, name: string, start_ms: number, duration_ms: number): Span => ({ id, parent, name, start_ms, duration_ms, status: "ok", attrs: {} });

describe("waterfall layout", () => {
  const spans = [span(1, null, "ticket", 0, 400), span(2, 1, "triage", 20, 200), span(3, 2, "llm", 30, 100), span(4, 1, "draft", 250, 100)];

  it("indents nested spans and positions bars by time, as percentages of the whole trace", () => {
    const rows = layout(spans);
    expect(rows.map((r) => [r.span.name, r.depth])).toEqual([["ticket", 0], ["triage", 1], ["llm", 2], ["draft", 1]]);
    expect(rows[0]).toMatchObject({ left: 0, width: 100 });
    expect(rows[1]).toMatchObject({ left: 5, width: 50 });
    expect(rows[3]).toMatchObject({ left: 62.5, width: 25 });
  });

  it("never lets a very short span shrink to nothing", () => {
    const rows = layout([span(1, null, "all", 0, 1000), span(2, 1, "tiny", 10, 0.1)]);
    expect(rows[1].width).toBe(0.8);
  });

  it("copes with an empty trace and a span whose parent is missing", () => {
    expect(layout([])).toEqual([]);
    expect(layout([span(2, 99, "orphan", 0, 10)])[0].depth).toBe(0);
  });

  it("formats times for people", () => {
    expect([formatMs(41.4), formatMs(999), formatMs(1250)]).toEqual(["41 ms", "999 ms", "1.3 s"]);
  });
});
