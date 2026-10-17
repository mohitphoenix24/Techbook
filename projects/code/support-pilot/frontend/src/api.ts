import { getToken } from "./session";
import { parseSSE } from "./sse";
import type { Me, Metrics, PipelineEvent, Simulate, Ticket, TicketSummary, Trace } from "./types";

// region: client
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, token = getToken()): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError(0, "network", "Could not reach the server. Is the backend running?");
  }
  if (!res.ok) throw await asError(res);
  return res.json();
}

/** The server always answers errors as { detail: { code, message } }. Anything else is shown generically. */
async function asError(res: Response): Promise<ApiError> {
  try {
    const { detail } = await res.json();
    if (detail?.message) return new ApiError(res.status, detail.code ?? "error", detail.message);
  } catch {
    /* not JSON */
  }
  return new ApiError(res.status, "error", `Request failed (${res.status})`);
}

const post = <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const whoAmI = (token: string) => request<Me>("/api/me", {}, token);
export const getHealth = () => request<{ provider: string; model: string }>("/api/health");
export const listTickets = (status = "", q = "") => request<TicketSummary[]>(`/api/tickets?${new URLSearchParams({ ...(status && { status }), ...(q && { q }) })}`);
export const getTicket = (id: number) => request<Ticket>(`/api/tickets/${id}`);
export const getTrace = (id: number) => request<Trace>(`/api/tickets/${id}/trace`);
export const getMetrics = () => request<Metrics>("/api/metrics");
export const editDraft = (id: number, text: string) => post<Ticket>(`/api/tickets/${id}/draft`, { text });
export const approve = (id: number) => post<Ticket>(`/api/tickets/${id}/approve`);
export const reject = (id: number, reason: string) => post<Ticket>(`/api/tickets/${id}/reject`, { reason });
export const send = (id: number) => post<Ticket>(`/api/tickets/${id}/send`);
export const close = (id: number) => post<Ticket>(`/api/tickets/${id}/close`);
export const submitIntake = (body: { from_email: string; subject: string; body: string }) => request<{ id: number; message: string }>("/api/intake", { method: "POST", body: JSON.stringify(body) }, null);
// endregion: client

// region: process-stream
/** Run the copilot on a ticket and yield its events as they happen. Abort the signal to stop watching. */
export async function* processStream(id: number, simulate: Simulate, signal: AbortSignal): AsyncGenerator<PipelineEvent> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`/api/tickets/${id}/process`, {
      method: "POST", signal, body: JSON.stringify({ simulate }),
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError(0, "network", "Could not reach the server. Is the backend running?");
  }
  if (!res.ok || !res.body) throw await asError(res);
  for await (const { event, data } of parseSSE(res.body)) yield { type: event, ...JSON.parse(data) } as PipelineEvent;
}
// endregion: process-stream
