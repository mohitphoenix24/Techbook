import { parseSSE } from "./sse";
import type { AgentEvent, HistoryTurn, NoteInfo, Proposal } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, "Could not reach the server. Is the backend running?");
  }
  if (!res.ok) {
    const detail = await res.json().then((b) => (typeof b?.detail === "string" ? b.detail : null)).catch(() => null);       // the server's own explanation, when it gave one
    throw new ApiError(res.status, detail ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export const getHealth = () => request<{ model: string; has_key: boolean }>("/api/health");
export const getNotes = () => request<NoteInfo[]>("/api/notes");
export const getNote = (name: string) => request<{ name: string; content: string }>(`/api/notes/${encodeURIComponent(name)}`);
export const getProposals = () => request<Proposal[]>("/api/proposals");

// region: decide
/** Only a person's click calls these. The agent has no tool that reaches them. */
export const applyProposal = (id: number) => request<Proposal>(`/api/proposals/${id}/apply`, { method: "POST" });
export const rejectProposal = (id: number) => request<Proposal>(`/api/proposals/${id}/reject`, { method: "POST" });
// endregion: decide

// region: chat-stream
/** POST a message and yield the agent's events as they happen. Abort the signal to stop. */
export async function* chatStream(body: { message: string; history: HistoryTurn[] }, signal: AbortSignal): AsyncGenerator<AgentEvent> {
  const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) throw new ApiError(res.status, res.status === 422 ? "That message is not valid (is it too long?)." : `Request failed (${res.status})`);
  for await (const { event, data } of parseSSE(res.body)) {
    yield { type: event, ...JSON.parse(data) } as AgentEvent;
  }
}
// endregion: chat-stream
