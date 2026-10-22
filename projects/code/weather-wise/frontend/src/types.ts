// region: types
export type Kind = "clear" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm";

export interface Day {
  date: string; weekday: string; summary: string; kind: Kind;
  temp_max: number | null; temp_min: number | null; rain_mm: number | null; rain_chance: number | null; wind_max: number | null; uv_max: number | null;
}

export interface Forecast {
  type: "forecast";
  place: string;
  timezone: string | null;
  current: { temp: number | null; feels_like: number | null; humidity: number | null; wind: number | null; rain_mm: number | null; summary: string; kind: Kind; time: string | null };
  days: Day[];
}

/** What a tool returned for the browser to draw (the model saw text; the browser gets data). */
export type ToolUi = Forecast | { type: "places"; places: { id: number; label: string }[] };

export interface Usage { input_tokens: number; output_tokens: number; cost_usd: number }

/** What the server streams while the agent works. Several tool_calls can be in flight at once. */
export type AgentEvent =
  | { type: "step"; step: number }
  | { type: "note"; step: number; text: string }
  | { type: "tool_call"; step: number; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; ok: boolean; summary: string; ui: ToolUi | null }
  | { type: "done"; answer: string; steps: number; usage: Usage }
  | { type: "error"; code: string; message: string; retryable: boolean };

export interface HistoryTurn { role: "user" | "assistant"; text: string }
// endregion: types
