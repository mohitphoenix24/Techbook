import type { AskEvent, CitationItem, Hit, Usage } from "./types";

// region: state
export interface Turn {
  id: string;
  question: string;
  hits: Hit[];                       // what search found and the call graph added, in the order the model saw them
  terms: string[];                   // the words of the question that search used
  text: string;                      // the answer as it streams in
  citations: CitationItem[] | null;  // null until the server has checked them
  usage: Usage | null;
  status: "working" | "done" | "error" | "stopped";
  error: string | null;
}

export interface ChatState { turns: Turn[]; busy: boolean }
export const initialState: ChatState = { turns: [], busy: false };

export type Action = { type: "asked"; id: string; question: string } | { type: "event"; event: AskEvent } | { type: "stopped" } | { type: "failed"; message: string } | { type: "clear" };
// endregion: state

const last = (s: ChatState, change: (t: Turn) => Turn): ChatState =>
  s.turns.length ? { ...s, turns: [...s.turns.slice(0, -1), change(s.turns[s.turns.length - 1])] } : s;

// region: reducer
function apply(t: Turn, e: AskEvent): Turn {
  switch (e.type) {
    case "retrieval":
      return { ...t, hits: e.hits, terms: e.terms };
    case "delta":
      return { ...t, text: t.text + e.text };
    case "citations":
      return { ...t, citations: e.items };
    case "usage":
      return { ...t, usage: { input_tokens: e.input_tokens, output_tokens: e.output_tokens, cost_usd: e.cost_usd } };
    case "done":
      return { ...t, status: "done" };
    case "error":
      return { ...t, status: "error", error: e.message };
  }
}

export function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case "asked":
      return { busy: true, turns: [...state.turns, { id: action.id, question: action.question, hits: [], terms: [], text: "", citations: null, usage: null, status: "working", error: null }] };
    case "event": {
      const next = last(state, (t) => apply(t, action.event));
      return { ...next, busy: action.event.type === "done" || action.event.type === "error" ? false : next.busy };
    }
    case "stopped":
      return { ...last(state, (t) => ({ ...t, status: "stopped" })), busy: false };
    case "failed":
      return { ...last(state, (t) => ({ ...t, status: "error", error: action.message })), busy: false };
    case "clear":
      return initialState;
  }
}
// endregion: reducer
