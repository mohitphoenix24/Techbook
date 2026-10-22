import { parseSSE } from "./sse";
import type { AgentEvent, HistoryTurn, Task } from "./types";

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
  if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`);
  return res.json();
}

export const getHealth = () => request<{ model: string; has_key: boolean }>("/api/health");
export const getTasks = () => request<Task[]>("/api/tasks");
export const setDone = (id: number, done: boolean) =>
  request<Task>(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done }) });

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
