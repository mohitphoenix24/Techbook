// region: types
export type Role = "user" | "assistant";
export type Status = "done" | "streaming" | "stopped" | "error";

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  stop_reason?: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  status: Status;
  usage?: Usage;
  error?: string;
}

export interface Persona {
  id: string;
  name: string;
  blurb: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  persona: string;
  updated_at: string;
  message_count: number;
}

/** What the server can say while a reply is streaming. */
export type ServerEvent =
  | { type: "meta"; conversation_id: string; provider: string; model: string; history_dropped: number }
  | { type: "delta"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "done"; message_id: number }
  | { type: "error"; code: string; message: string; retryable: boolean };
// endregion: types
