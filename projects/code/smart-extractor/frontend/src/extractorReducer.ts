import { getAt, isDirty, removeAt, setAt } from "./paths";
import type { Data, ExtractionResult, Issue, Mistake } from "./types";

// region: state
export interface State {
  docTypeId: string;
  text: string;
  mistake: Mistake;
  status: "idle" | "extracting" | "done" | "error";
  error: string | null;
  extractedText: string | null;        // the text the result refers to: highlight offsets are only valid for this text
  result: ExtractionResult | null;     // exactly what the server returned
  data: Data | null;                   // the editable copy the form shows
  baseline: Data | null;               // the data as extracted or last saved: to know whether the person changed anything
  reviewIssues: Issue[];               // problems the server found in the person's corrections
  saved: boolean;
  focusPath: string | null;            // the field being looked at: its evidence is highlighted in the source
}

export const initialState: State = {
  docTypeId: "", text: "", mistake: "none", status: "idle", error: null,
  extractedText: null, result: null, data: null, baseline: null, reviewIssues: [], saved: false, focusPath: null,
};

export type Action =
  | { type: "pickType"; id: string }
  | { type: "setText"; text: string }
  | { type: "setMistake"; mistake: Mistake }
  | { type: "extracting" }
  | { type: "extracted"; result: ExtractionResult; sourceText: string; reviewed?: Data | null }
  | { type: "failed"; message: string }
  | { type: "edit"; path: string; value: unknown }
  | { type: "removeItem"; listPath: string; index: number }
  | { type: "saved"; data: Data }
  | { type: "saveFailed"; issues: Issue[]; message: string }
  | { type: "focus"; path: string | null };
// endregion: state

// region: reducer
export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "pickType":
      return { ...initialState, docTypeId: action.id, mistake: state.mistake };           // a new type starts clean
    case "setText":
      return { ...state, text: action.text };
    case "setMistake":
      return { ...state, mistake: action.mistake };
    case "extracting":
      return { ...state, status: "extracting", error: null, reviewIssues: [], saved: false };
    case "extracted": {
      const data = action.reviewed ?? action.result.data;                                   // reopen a reviewed record with the corrections
      return { ...state, status: "done", error: null, text: action.sourceText, extractedText: action.sourceText, result: action.result, data, baseline: data, reviewIssues: [], saved: !!action.reviewed, focusPath: null };
    }
    case "failed":
      return { ...state, status: "error", error: action.message };
    case "edit":
      return state.data ? { ...state, data: setAt(state.data, action.path, action.value), saved: false, reviewIssues: state.reviewIssues.filter((i) => i.path !== action.path) } : state;
    case "removeItem":
      return state.data ? { ...state, data: removeAt(state.data, action.listPath, action.index), saved: false } : state;
    case "saved":
      return { ...state, data: action.data, baseline: action.data, saved: true, reviewIssues: [] };
    case "saveFailed":
      return { ...state, reviewIssues: action.issues, error: action.issues.length ? null : action.message };
    case "focus":
      return { ...state, focusPath: action.path };
  }
}

export const isEdited = (s: State) => !!s.data && !!s.baseline && isDirty(s.data, s.baseline);
export const valueAt = (s: State, path: string) => (s.data ? getAt(s.data, path) : undefined);
// endregion: reducer
