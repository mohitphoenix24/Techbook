import { describe, expect, it } from "vitest";
import { forecastsOf, historyOf, initialState, reducer, type State } from "./chatReducer";
import type { AgentEvent, Forecast } from "./types";

const usage = { input_tokens: 900, output_tokens: 120, cost_usd: 0.006 };
const forecast: Forecast = {
  type: "forecast", place: "Pune, Maharashtra, India", timezone: "Asia/Kolkata",
  current: { temp: 33, feels_like: 35, humidity: 32, wind: 8, rain_mm: 0, summary: "Mainly clear", kind: "clear", time: "2026-10-18T13:00" },
  days: [{ date: "2026-10-18", weekday: "Sun", summary: "Overcast", kind: "cloud", temp_max: 34, temp_min: 23, rain_mm: 0, rain_chance: 29, wind_max: 10, uv_max: 7 }],
};
const asked = () => reducer(initialState, { type: "asked", id: "1", question: "Pune or Goa?" });
const run = (events: AgentEvent[], from: State = asked()) => events.reduce((s, event) => reducer(s, { type: "event", event }), from);

describe("chat reducer", () => {
  it("tracks two tool calls that are running at the same time", () => {
    const s = run([
      { type: "tool_call", step: 0, id: "a", name: "find_place", input: { name: "Pune" } },
      { type: "tool_call", step: 0, id: "b", name: "find_place", input: { name: "Goa" } },
      { type: "tool_result", id: "b", name: "find_place", ok: true, summary: "Panjim", ui: null },
    ]);
    const [a, b] = s.exchanges[0].steps;
    expect(a.result).toBeNull();                              // Pune is still running
    expect(b.result).toMatchObject({ ok: true, summary: "Panjim" });   // Goa finished first: results can arrive in any order
  });

  it("keeps a forecast for the browser to draw, and only successful ones", () => {
    const s = run([
      { type: "tool_call", step: 1, id: "c", name: "get_forecast", input: { place_id: 1 } },
      { type: "tool_call", step: 1, id: "d", name: "get_forecast", input: { place_id: 2 } },
      { type: "tool_result", id: "c", name: "get_forecast", ok: true, summary: "Pune: 1 days", ui: forecast },
      { type: "tool_result", id: "d", name: "get_forecast", ok: false, summary: "unknown place id", ui: null },
    ]);
    expect(forecastsOf(s.exchanges[0])).toEqual([forecast]);
  });

  it("gives a note to the first tool call that follows it, once", () => {
    const s = run([
      { type: "note", step: 0, text: "Looking both up." },
      { type: "tool_call", step: 0, id: "a", name: "find_place", input: {} },
      { type: "tool_call", step: 0, id: "b", name: "find_place", input: {} },
    ]);
    expect(s.exchanges[0].steps.map((x) => x.note)).toEqual(["Looking both up.", undefined]);
  });

  it("finishes with the answer and usage, and is no longer busy", () => {
    const s = run([{ type: "done", answer: "Pune is warmer.", steps: 3, usage }]);
    expect(s.busy).toBe(false);
    expect(s.exchanges[0]).toMatchObject({ status: "done", answer: "Pune is warmer.", usage });
  });

  it("keeps what was fetched when an error ends the run", () => {
    const s = run([
      { type: "tool_call", step: 0, id: "a", name: "find_place", input: {} },
      { type: "error", code: "rate_limited", message: "Too many requests", retryable: true },
    ]);
    expect(s).toMatchObject({ busy: false, exchanges: [{ status: "error", error: "Too many requests" }] });
    expect(s.exchanges[0].steps).toHaveLength(1);
  });

  it("handles stop, network failure and clear", () => {
    expect(reducer(asked(), { type: "stopped" })).toMatchObject({ busy: false, exchanges: [{ status: "stopped" }] });
    expect(reducer(asked(), { type: "failed", message: "offline" }).exchanges[0].error).toBe("offline");
    expect(reducer(asked(), { type: "clear" })).toEqual(initialState);
  });

  it("sends only finished exchanges back as plain-text history", () => {
    let s = run([{ type: "done", answer: "Pune is warmer.", steps: 3, usage }]);
    s = reducer(s, { type: "asked", id: "2", question: "and Delhi?" });
    expect(historyOf(s)).toEqual([{ role: "user", text: "Pune or Goa?" }, { role: "assistant", text: "Pune is warmer." }]);
  });
});
