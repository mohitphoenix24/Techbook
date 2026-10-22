import { parseSSE } from "./sse";
import type { AgentEvent, HistoryTurn } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function getHealth(): Promise<{ model: string; has_key: boolean; max_searches: number }> {
  let res: Response;
  try {
    res = await fetch("/api/health");
  } catch {
    throw new ApiError(0, "Could not reach the server. Is the backend running?");
  }
  if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`);
  return res.json();
}

// region: chat-stream
/** POST a question and yield the agent's events as they happen. Abort the signal to stop. */
export async function* chatStream(body: { message: string; history: HistoryTurn[] }, signal: AbortSignal): AsyncGenerator<AgentEvent> {
  const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) throw new ApiError(res.status, res.status === 422 ? "That question is not valid (is it too long?)." : `Request failed (${res.status})`);
  for await (const { event, data } of parseSSE(res.body)) {
    yield { type: event, ...JSON.parse(data) } as AgentEvent;
  }
}
// endregion: chat-stream
