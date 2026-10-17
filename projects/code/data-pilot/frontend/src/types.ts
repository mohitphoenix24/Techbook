// region: types
export type Cell = string | number | null;

export interface TableData {
  type: "table";
  sql: string;
  columns: string[];
  rows: Cell[][];
  row_count: number;
  truncated: boolean;
  ms: number;
}

export interface ChartData {
  type: "chart";
  kind: "bar" | "line" | "pie";
  title: string;
  x: string;
  y: string;
  points: [string, number][];
  clipped: boolean;
}

/** What a tool returned, for the browser to draw. */
export type ToolUi = TableData | ChartData | { type: "error"; message: string } | { type: "columns"; table: string; columns: { name: string; type: string }[] } | { type: "tables"; tables: { table: string; rows: number; description: string }[] };

export interface Usage { input_tokens: number; output_tokens: number; cost_usd: number }

/** The events one question streams. Every tool call is followed by its result. */
export type AgentEvent =
  | { type: "turn"; turn: number }
  | { type: "delta"; turn: number; text: string }
  | { type: "tool_call"; turn: number; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; ok: boolean; summary: string; ui: ToolUi }
  | { type: "usage"; input_tokens: number; output_tokens: number; cost_usd: number }
  | { type: "done"; answer: string; queries: string[] }
  | { type: "error"; code: string; message: string; retryable: boolean };

export interface SchemaTable { table: string; rows: number; description: string; columns: { name: string; type: string }[] }
export type Mistake = "none" | "wrong_column" | "unsafe";
export interface PastTurn { question: string; answer: string; queries: string[] }
// endregion: types
