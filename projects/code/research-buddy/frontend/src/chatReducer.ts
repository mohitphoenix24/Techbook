import type { AgentEvent, HistoryTurn, Page, Source, Usage } from "./types";

// region: state
export interface Search { id: string; query: string; state: "running" | "ok" | "failed"; results: Page[]; error: string | null }
export interface Calc { id: string; expression: string; result: { ok: boolean; summary: string } | null }

export interface Exchange {
  id: string;
  question: string;
  notes: string[];                       // what Claude said while working ("I'll search for...")
  searches: Search[];
  calcs: Calc[];
  answer: string;
  sources: Source[];                     // the pages the answer cites, numbered
  searched: Page[];                      // every page the searches returned
  status: "working" | "done" | "stopped" | "error";
  error: string | null;
  usage: Usage | null;
}

export interface State { exchanges: Exchange[]; busy: boolean }
export const initialState: State = { exchanges: [], busy: false };

export type Action =
  | { type: "asked"; id: string; question: string }
  | { type: "event"; event: AgentEvent }
  | { type: "stopped" }
  | { type: "failed"; message: string }
  | { type: "clear" };
// endregion: state

const last = (s: State, change: (x: Exchange) => Exchange): State =>
  s.exchanges.length ? { ...s, exchanges: [...s.exchanges.slice(0, -1), change(s.exchanges[s.exchanges.length - 1])] } : s;

// region: reducer
function apply(x: Exchange, e: AgentEvent): Exchange {
  switch (e.type) {
    case "step":
      return x;
    case "note":
      return { ...x, notes: [...x.notes, e.text] };
    case "search":
      return { ...x, searches: [...x.searches, { id: e.id, query: e.query, state: "running", results: [], error: null }] };
    case "search_result":
      return { ...x, searches: x.searches.map((s) => (s.id !== e.id ? s : e.ok ? { ...s, state: "ok", results: e.results } : { ...s, state: "failed", error: e.error })) };
    case "tool_call":
      return { ...x, calcs: [...x.calcs, { id: e.id, expression: String(e.input.expression ?? ""), result: null }] };
    case "tool_result":
      return { ...x, calcs: x.calcs.map((c) => (c.id === e.id ? { ...c, result: { ok: e.ok, summary: e.summary } } : c)) };
    case "done":
      return { ...x, status: "done", answer: e.answer, sources: e.sources, searched: e.searched, usage: e.usage };
    case "error":
      return { ...x, status: "error", error: e.message };
  }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "asked":
      return { busy: true, exchanges: [...state.exchanges, { id: action.id, question: action.question, notes: [], searches: [], calcs: [], answer: "", sources: [], searched: [], status: "working", error: null, usage: null }] };
    case "event": {
      const next = last(state, (x) => apply(x, action.event));
      return { ...next, busy: action.event.type === "done" || action.event.type === "error" ? false : next.busy };
    }
    case "stopped":
      return { ...last(state, (x) => ({ ...x, status: "stopped" })), busy: false };
    case "failed":
      return { ...last(state, (x) => ({ ...x, status: "error", error: action.message })), busy: false };
    case "clear":
      return initialState;
  }
}

/** The earlier part of the conversation, as the plain text the server expects. Only finished exchanges count. */
export function historyOf(state: State, keep = 4): HistoryTurn[] {
  return state.exchanges
    .filter((x) => x.status === "done")
    .slice(-keep)
    .flatMap((x): HistoryTurn[] => [{ role: "user", text: x.question }, { role: "assistant", text: x.answer || "(done)" }]);
}
// endregion: reducer
