import type { PipelineEvent } from "./types";

// region: state
export interface StageState {
  name: string;
  status: "running" | "done";
  summary: string;
  ms: number | null;
}

export interface RunState {
  phase: "idle" | "running" | "done" | "error";
  stages: StageState[];            // in the order the stages first appeared
  text: string;                    // the draft as it streams in
  revised: boolean;                // the copilot rewrote a draft that failed a check
  error: string | null;
  cost: number | null;
}

export const idle: RunState = { phase: "idle", stages: [], text: "", revised: false, error: null, cost: null };

export type RunAction = { type: "start" } | { type: "event"; event: PipelineEvent } | { type: "failed"; message: string } | { type: "clear" };
// endregion: state

// region: reducer
function withStage(stages: StageState[], name: string, patch: Partial<StageState>): StageState[] {
  return stages.some((s) => s.name === name)
    ? stages.map((s) => (s.name === name ? { ...s, ...patch } : s))
    : [...stages, { name, status: "running", summary: "", ms: null, ...patch }];
}

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case "start":
      return { ...idle, phase: "running" };
    case "clear":
      return idle;
    case "failed":
      return { ...state, phase: "error", error: action.message, stages: state.stages.map((s) => (s.status === "running" ? { ...s, status: "done", summary: "stopped" } : s)) };
    case "event": {
      const e = action.event;
      switch (e.type) {
        case "stage":
          return {
            ...state,
            revised: state.revised || e.name === "revise",
            stages: withStage(state.stages, e.name, e.status === "start" ? { status: "running" } : { status: "done", summary: e.summary ?? "", ms: e.ms ?? null }),
          };
        case "delta":
          return { ...state, text: state.text + e.text };
        case "reset":
          return { ...state, text: "" };                         // a revision is about to stream: forget the first attempt
        case "draft":
          return { ...state, text: e.draft.text };
        case "error":
          return { ...state, phase: "error", error: e.message, stages: state.stages.map((s) => (s.status === "running" ? { ...s, status: "done", summary: "failed" } : s)) };
        case "done":
          return { ...state, phase: "done", cost: e.trace.cost_usd };
      }
    }
  }
}
// endregion: reducer
