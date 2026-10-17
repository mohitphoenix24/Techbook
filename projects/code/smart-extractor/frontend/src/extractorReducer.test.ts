import { describe, expect, it } from "vitest";
import { initialState, isEdited, reducer, type Action, type State } from "./extractorReducer";
import type { ExtractionResult } from "./types";

const result: ExtractionResult = {
  id: "e1", doc_type: "invoice", data: { vendor: "Acme", items: [{ a: 1 }, { a: 2 }] }, valid: true, attempts: 1, issues: [], grounding: {},
  usage: { input_tokens: 10, output_tokens: 5, cost_usd: 0.001 }, provider: "mock", model: "mock-1", duration_ms: 3,
};
const run = (...actions: Action[]): State => actions.reduce(reducer, { ...initialState, docTypeId: "invoice" });

// region: reducer-tests
describe("extractor reducer", () => {
  it("goes idle -> extracting -> done and keeps an editable copy", () => {
    const s = run({ type: "extracting" }, { type: "extracted", result, sourceText: "doc" });
    expect(s.status).toBe("done");
    expect(s.data).toEqual(result.data);
    expect(s.data).toBe(s.baseline);                    // same object until the person edits something
    expect(isEdited(s)).toBe(false);
  });

  it("editing changes the copy, not the server's result, and marks the state as edited", () => {
    const s = run({ type: "extracted", result, sourceText: "doc" }, { type: "edit", path: "items.1.a", value: 99 });
    expect((s.data as any).items[1].a).toBe(99);
    expect(s.result!.data).toEqual({ vendor: "Acme", items: [{ a: 1 }, { a: 2 }] });
    expect(isEdited(s)).toBe(true);
    expect(s.saved).toBe(false);
  });
// endregion: reducer-tests

  it("changing a field clears the server's complaint about that field only", () => {
    const issues = [{ path: "vendor", level: "error" as const, message: "x" }, { path: "total", level: "error" as const, message: "y" }];
    const s = run({ type: "extracted", result, sourceText: "doc" }, { type: "saveFailed", issues, message: "" }, { type: "edit", path: "vendor", value: "Beta" });
    expect(s.reviewIssues.map((i) => i.path)).toEqual(["total"]);
  });

  it("removing a list item and saving resets the baseline", () => {
    const s = run({ type: "extracted", result, sourceText: "doc" }, { type: "removeItem", listPath: "items", index: 0 });
    expect((s.data as any).items).toEqual([{ a: 2 }]);
    const saved = reducer(s, { type: "saved", data: s.data! });
    expect(isEdited(saved)).toBe(false);
    expect(saved.saved).toBe(true);
  });

  it("reopening a reviewed record shows the corrections", () => {
    const s = run({ type: "extracted", result, sourceText: "doc", reviewed: { vendor: "Fixed", items: [] } });
    expect((s.data as any).vendor).toBe("Fixed");
    expect(s.saved).toBe(true);
  });

  it("picking another document type starts clean but keeps the mistake setting", () => {
    const s = run({ type: "setMistake", mistake: "rule" }, { type: "setText", text: "abc" }, { type: "extracted", result, sourceText: "doc" }, { type: "pickType", id: "meeting_notes" });
    expect(s).toMatchObject({ docTypeId: "meeting_notes", text: "", extractedText: null, result: null, data: null, mistake: "rule", status: "idle" });
  });

  it("failures keep the text so the person can try again", () => {
    const s = run({ type: "setText", text: "abc" }, { type: "extracting" }, { type: "failed", message: "Rate limited" });
    expect(s).toMatchObject({ status: "error", error: "Rate limited", text: "abc" });
  });
});
