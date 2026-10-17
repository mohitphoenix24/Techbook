import type { AgentEvent, ToolUi, Usage } from "./types";

// region: state
export interface Step {
  id: string;
  turn: number;
  name: string;
  input: Record<string, unknown>;
  result: { ok: boolean; summary: string; ui: ToolUi } | null;      // null while the tool is still running
}

export interface Turn {
  id: string;
  question: string;
  steps: Step[];
  texts: Record<number, string>;       // what the model said in each of its turns; the LAST turn's text is the answer
  turns: number;                       // how many times the model has been called
  status: "working" | "done" | "stopped" | "error";
  queries: string[];
  usage: Usage | null;
  error: string | null;
}

export interface State { turns: Turn[]; busy: boolean }
export const initialState: State = { turns: [], busy: false };

export type Action = { type: "asked"; id: string; question: string } | { type: "event"; event: AgentEvent } | { type: "stopped" } | { type: "failed"; message: string } | { type: "clear" };
// endregion: state

const last = (s: State, change: (t: Turn) => Turn): State =>
  s.turns.length ? { ...s, turns: [...s.turns.slice(0, -1), change(s.turns[s.turns.length - 1])] } : s;

// region: reducer
function apply(t: Turn, e: AgentEvent): Turn {
  switch (e.type) {
    case "turn":
      return { ...t, turns: e.turn + 1 };
    case "delta":
      return { ...t, texts: { ...t.texts, [e.turn]: (t.texts[e.turn] ?? "") + e.text } };
    case "tool_call":
      return { ...t, steps: [...t.steps, { id: e.id, turn: e.turn, name: e.name, input: e.input, result: null }] };
    case "tool_result":
      return { ...t, steps: t.steps.map((s) => (s.id === e.id ? { ...s, result: { ok: e.ok, summary: e.summary, ui: e.ui } } : s)) };
    case "usage":
      return { ...t, usage: { input_tokens: e.input_tokens, output_tokens: e.output_tokens, cost_usd: e.cost_usd } };
    case "done":
      return { ...t, status: "done", queries: e.queries };
    case "error":
      return { ...t, status: "error", error: e.message };
  }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "asked":
      return { busy: true, turns: [...state.turns, { id: action.id, question: action.question, steps: [], texts: {}, turns: 0, status: "working", queries: [], usage: null, error: null }] };
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

/** The answer is what the model said in its final turn, the one that called no tools. Earlier text is "thinking aloud". */
export function answerOf(t: Turn): string {
  const toolTurns = new Set(t.steps.map((s) => s.turn));
  const finalTurn = t.turns - 1;
  return t.status === "working" || t.status === "done" || t.status === "stopped" ? (toolTurns.has(finalTurn) ? "" : t.texts[finalTurn] ?? "") : "";
}

export function notesOf(t: Turn): Record<number, string> {
  const toolTurns = new Set(t.steps.map((s) => s.turn));
  return Object.fromEntries(Object.entries(t.texts).filter(([turn]) => toolTurns.has(Number(turn))));
}

export function historyOf(state: State, keep = 3) {
  return state.turns.filter((t) => t.status === "done").slice(-keep).map((t) => ({ question: t.question, answer: answerOf(t), queries: t.queries }));
}
// endregion: reducer
