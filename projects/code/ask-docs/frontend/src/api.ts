import { parseSSE } from "./sse";
import type { AskEvent, AskSettings, ChunkDetail, Citations, DocumentInfo, Source, Usage } from "./types";

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
    let message = `Request failed (${res.status})`;
    try {
      const { detail } = await res.json();
      if (typeof detail === "string") message = detail;
      else if (Array.isArray(detail)) message = detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch { /* not JSON */ }
    throw new ApiError(res.status, message);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const getHealth = () => request<{ provider: string; model: string; embedder: string; stale_chunks: number }>("/api/health");
export const listDocuments = () => request<DocumentInfo[]>("/api/documents");
export const deleteDocument = (id: string) => request<void>(`/api/documents/${id}`, { method: "DELETE" });
export const loadSamples = () => request<DocumentInfo[]>("/api/documents/samples", { method: "POST" });
export const reindex = () => request<{ reindexed: number }>("/api/reindex", { method: "POST" });
export const getChunk = (id: number) => request<ChunkDetail>(`/api/chunks/${id}`);

export function uploadDocuments(files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return request<DocumentInfo[]>("/api/documents", { method: "POST", body: form });
}

export interface AskBody { question: string; history: { role: "user" | "assistant"; content: string }[]; settings: AskSettings }

// region: ask-stream
/** POST a question and yield the events of the answer: rewrite, sources, delta..., citations, usage, done. */
export async function* askStream({ question, history, settings }: AskBody, signal: AbortSignal): AsyncGenerator<AskEvent> {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history, mode: settings.mode, top_k: settings.topK, document_ids: settings.documentIds }),
    signal,
  });
  if (!res.ok || !res.body) throw new ApiError(res.status, `Request failed (${res.status})`);

  for await (const { event, data } of parseSSE(res.body)) {
    const payload = JSON.parse(data);
    switch (event) {
      case "rewrite": case "sources": case "delta": case "done": case "error":
        yield { type: event, ...payload } as AskEvent;
        break;
      case "citations":
        yield { type: "citations", citations: payload as Citations };
        break;
      case "usage":
        yield { type: "usage", usage: payload as Usage };
        break;
    }
  }
}
// endregion: ask-stream

export type { Source };
