// region: types
export interface Page { title: string; url: string; age: string | null }
export interface Source { n: number; title: string; url: string; quote: string }
export interface Usage { input_tokens: number; output_tokens: number; searches: number; cost_usd: number }

/** What the server streams while the agent works. */
export type AgentEvent =
  | { type: "step"; step: number }
  | { type: "note"; step: number; text: string }
  | { type: "search"; id: string; query: string }
  | { type: "search_result"; id: string; ok: true; results: Page[] }
  | { type: "search_result"; id: string; ok: false; error: string }
  | { type: "tool_call"; step: number; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; ok: boolean; summary: string }
  | { type: "done"; answer: string; sources: Source[]; searched: Page[]; steps: number; usage: Usage }
  | { type: "error"; code: string; message: string; retryable: boolean };

export interface HistoryTurn { role: "user" | "assistant"; text: string }
// endregion: types
