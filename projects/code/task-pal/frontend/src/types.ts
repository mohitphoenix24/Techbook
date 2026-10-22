// region: types
export interface Task { id: number; title: string; due: string | null; priority: "low" | "normal" | "high"; done: boolean }

export interface Usage { input_tokens: number; output_tokens: number; cost_usd: number }

/** What the server streams while the agent works. A tool_call is always followed by its tool_result. */
export type AgentEvent =
  | { type: "step"; step: number }
  | { type: "note"; step: number; text: string }
  | { type: "tool_call"; step: number; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; ok: boolean; summary: string; changed: boolean }
  | { type: "done"; answer: string; steps: number; usage: Usage }
  | { type: "error"; code: string; message: string; retryable: boolean };

export interface HistoryTurn { role: "user" | "assistant"; text: string }
// endregion: types
