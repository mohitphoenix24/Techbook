import { parseSSE } from "./sse";
import type { AgentEvent, Mistake, PastTurn, SchemaTable } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path);
  } catch {
    throw new ApiError(0, "Could not reach the server. Is the backend running?");
  }
  if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`);
  return res.json();
}

export const getHealth = () => get<{ provider: string; model: string }>("/api/health");
export const getSchema = () => get<SchemaTable[]>("/api/schema");

// region: ask-stream
/** POST a question and yield the agent's events as they happen. Abort the signal to stop it. */
export async function* askStream(body: { question: string; history: PastTurn[]; simulate_mistake: Mistake }, signal: AbortSignal): AsyncGenerator<AgentEvent> {
  const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) throw new ApiError(res.status, res.status === 422 ? "That question is not valid (is it too long?)." : `Request failed (${res.status})`);
  for await (const { event, data } of parseSSE(res.body)) {
    yield { type: event, ...JSON.parse(data) } as AgentEvent;
  }
}
// endregion: ask-stream
