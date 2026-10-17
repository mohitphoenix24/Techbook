import { parseSSE } from "./sse";
import type { ConversationSummary, Persona, ServerEvent, Usage } from "./types";

// region: request
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new ApiError(res.status, await errorText(res));
  return res.status === 204 ? (undefined as T) : res.json();
}

/** FastAPI sends errors as {"detail": "..."} (or a list of problems for 422 validation errors). */
async function errorText(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return body.detail.map((d: { msg: string }) => d.msg).join("; ");
  } catch { /* not JSON */ }
  return `Request failed (${res.status})`;
}
// endregion: request

export const listPersonas = () => request<Persona[]>("/api/personas");
export const listConversations = () => request<ConversationSummary[]>("/api/conversations");
export const deleteConversation = (id: string) => request<void>(`/api/conversations/${id}`, { method: "DELETE" });

export interface StoredMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  stopped: boolean;
}
export interface ConversationDetail {
  id: string;
  title: string;
  persona: string;
  messages: StoredMessage[];
}
export const getConversation = (id: string) => request<ConversationDetail>(`/api/conversations/${id}`);

export interface ChatBody {
  conversation_id?: string | null;
  message?: string;
  persona: string;
  regenerate?: boolean;
}

// region: stream-chat
/**
 * POST a message and yield the reply as typed events while it is being written.
 * Cancel it with `signal` (that is what the Stop button does).
 */
export async function* streamChat(body: ChatBody, signal: AbortSignal): AsyncGenerator<ServerEvent> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new ApiError(res.status, await errorText(res));      // 404 / 422 happen before streaming starts
  if (!res.body) throw new Error("This browser cannot stream responses.");

  for await (const { event, data } of parseSSE(res.body)) {
    const payload = JSON.parse(data);
    switch (event) {
      case "meta":
      case "delta":
      case "done":
      case "error":
        yield { type: event, ...payload } as ServerEvent;
        break;
      case "usage":
        yield { type: "usage", usage: payload as Usage };
        break;
    }
  }
}
// endregion: stream-chat
