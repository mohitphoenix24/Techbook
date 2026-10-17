import type { Citations, Source, Usage } from "./types";

// region: state
export interface Turn {
  id: string;
  question: string;
  standalone: string | null;          // the question after rewriting, if it was rewritten
  sources: Source[];
  relevant: boolean | null;           // null until the search has finished
  answer: string;
  status: "searching" | "streaming" | "done" | "stopped" | "error";
  citations: Citations | null;
  usage: Usage | null;
  error: string | null;
}

export interface AskState { turns: Turn[]; busy: boolean }
export const initialState: AskState = { turns: [], busy: false };

export type Action =
  | { type: "asked"; id: string; question: string }
  | { type: "rewrite"; standalone: string; rewritten: boolean }
  | { type: "sources"; sources: Source[]; relevant: boolean }
  | { type: "delta"; text: string }
  | { type: "citations"; citations: Citations }
  | { type: "usage"; usage: Usage }
  | { type: "finished" }
  | { type: "stopped" }
  | { type: "failed"; message: string }
  | { type: "clear" };
// endregion: state

const last = (s: AskState, change: (t: Turn) => Turn): AskState =>
  s.turns.length ? { ...s, turns: [...s.turns.slice(0, -1), change(s.turns[s.turns.length - 1])] } : s;

// region: reducer
export function reducer(state: AskState, action: Action): AskState {
  switch (action.type) {
    case "asked":
      return {
        busy: true,
        turns: [...state.turns, { id: action.id, question: action.question, standalone: null, sources: [], relevant: null, answer: "", status: "searching", citations: null, usage: null, error: null }],
      };
    case "rewrite":
      return last(state, (t) => ({ ...t, standalone: action.rewritten ? action.standalone : null }));
    case "sources":
      return last(state, (t) => ({ ...t, sources: action.sources, relevant: action.relevant, status: "streaming" }));
    case "delta":
      return last(state, (t) => ({ ...t, answer: t.answer + action.text }));
    case "citations":
      return last(state, (t) => ({ ...t, citations: action.citations }));
    case "usage":
      return last(state, (t) => ({ ...t, usage: action.usage }));
    case "finished":
      return { ...last(state, (t) => (t.status === "streaming" || t.status === "searching" ? { ...t, status: "done" } : t)), busy: false };
    case "stopped":
      return { ...last(state, (t) => ({ ...t, status: "stopped" })), busy: false };
    case "failed":
      return { ...last(state, (t) => ({ ...t, status: "error", error: action.message })), busy: false };
    case "clear":
      return initialState;
  }
}

/** What to send back as "the conversation so far": finished turns only, and only the last few. */
export function historyOf(state: AskState, keep = 4): { role: "user" | "assistant"; content: string }[] {
  return state.turns
    .filter((t) => t.status === "done" && t.answer)
    .slice(-keep)
    .flatMap((t) => [{ role: "user" as const, content: t.question }, { role: "assistant" as const, content: t.answer }]);
}
// endregion: reducer
