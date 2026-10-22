import type { AgentEvent, Forecast, HistoryTurn, ToolUi, Usage } from "./types";

// region: state
export interface Step {
  id: string;
  name: string;
  input: Record<string, unknown>;
  note?: string;                                                         // what Claude said just before asking for this tool
  result: { ok: boolean; summary: string; ui: ToolUi | null } | null;    // null while the tool is still running
}

export interface Exchange {
  id: string;
  question: string;
  steps: Step[];
  pendingNote: string;
  answer: string;
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
      return { ...x, pendingNote: e.text };
    case "tool_call":
      return { ...x, pendingNote: "", steps: [...x.steps, { id: e.id, name: e.name, input: e.input, note: x.pendingNote || undefined, result: null }] };
    case "tool_result":
      return { ...x, steps: x.steps.map((s) => (s.id === e.id ? { ...s, result: { ok: e.ok, summary: e.summary, ui: e.ui } } : s)) };
    case "done":
      return { ...x, status: "done", answer: e.answer, usage: e.usage };
    case "error":
      return { ...x, status: "error", error: e.message };
  }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "asked":
      return { busy: true, exchanges: [...state.exchanges, { id: action.id, question: action.question, steps: [], pendingNote: "", answer: "", status: "working", error: null, usage: null }] };
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

/** The forecasts an exchange has fetched so far, in the order they arrived: the browser draws one card for each. */
export function forecastsOf(x: Exchange): Forecast[] {
  return x.steps.flatMap((s) => (s.result?.ok && s.result.ui?.type === "forecast" ? [s.result.ui] : []));
}

/** The earlier part of the conversation, as the plain text the server expects. Only finished exchanges count. */
export function historyOf(state: State, keep = 6): HistoryTurn[] {
  return state.exchanges
    .filter((x) => x.status === "done")
    .slice(-keep)
    .flatMap((x): HistoryTurn[] => [{ role: "user", text: x.question }, { role: "assistant", text: x.answer || "(done)" }]);
}
// endregion: reducer
