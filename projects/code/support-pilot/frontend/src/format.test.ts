import { describe, expect, it } from "vitest";
import { ago, inr, usd } from "./format";

describe("format", () => {
  it("groups rupees the Indian way", () => {
    expect([inr(999), inr(4499), inr(24999), inr(211881), inr(12345678)]).toEqual(["₹999", "₹4,499", "₹24,999", "₹2,11,881", "₹1,23,45,678"]);
  });

  it("shows tiny dollar amounts with enough digits to be meaningful", () => {
    expect([usd(0.0018), usd(0.5)]).toEqual(["$0.0018", "$0.50"]);
  });

  it("says how long ago, roughly", () => {
    const now = Date.parse("2026-10-12T12:00:00Z");
    expect([ago("2026-10-12T11:59:40Z", now), ago("2026-10-12T11:30:00Z", now), ago("2026-10-12T09:00:00Z", now), ago("2026-10-09T12:00:00Z", now)]).toEqual(["just now", "30 min ago", "3 h ago", "3 days ago"]);
  });
});
