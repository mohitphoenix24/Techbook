import { parseSSE } from "./sse";
import type { AskEvent, RepoSummary, TreeEntry } from "./types";

// region: client
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, "network", "Could not reach the server. Is the backend running?");
  }
  if (!res.ok) throw await asError(res);
  return res.status === 204 ? (undefined as T) : res.json();
}

/** The server answers every error as { detail: { code, message } }. */
async function asError(res: Response): Promise<ApiError> {
  try {
    const { detail } = await res.json();
    if (detail?.message) return new ApiError(res.status, detail.code ?? "error", detail.message);
  } catch {
    /* not JSON */
  }
  return new ApiError(res.status, "error", `Request failed (${res.status})`);
}

export const listRepos = () => request<RepoSummary[]>("/api/repos");
export const getTree = (id: string) => request<TreeEntry[]>(`/api/repos/${id}/tree`);
export const getFile = (id: string, path: string) => request<{ path: string; lines: string[] }>(`/api/repos/${id}/file?${new URLSearchParams({ path })}`);
export const deleteRepo = (id: string) => request<void>(`/api/repos/${id}`, { method: "DELETE" });

export function uploadRepo(file: File): Promise<RepoSummary> {
  const form = new FormData();
  form.append("file", file);                                    // the browser sets the multipart boundary itself
  return request<RepoSummary>("/api/repos", { method: "POST", body: form });
}
// endregion: client

// region: ask-stream
/** POST a question and yield the events as they happen. Abort the signal to stop. */
export async function* askStream(id: string, body: { question: string; expand: boolean; simulate: string }, signal: AbortSignal): AsyncGenerator<AskEvent> {
  let res: Response;
  try {
    res = await fetch(`/api/repos/${id}/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError(0, "network", "Could not reach the server. Is the backend running?");
  }
  if (!res.ok || !res.body) throw await asError(res);
  for await (const { event, data } of parseSSE(res.body)) yield { type: event, ...JSON.parse(data) } as AskEvent;
}
// endregion: ask-stream
