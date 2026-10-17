import type { Data, DocTypeInfo, ExtractionResult, HistoryItem, Issue, Mistake } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string, public issues: Issue[] = []) {
    super(message);
  }
}

// region: request
/** FastAPI errors are {"detail": "text"} or, for our review route, {"detail": [{path, message}, ...]}. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, "Could not reach the server. Is the backend running?");
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let issues: Issue[] = [];
    try {
      const { detail } = await res.json();
      if (typeof detail === "string") message = detail;
      else if (Array.isArray(detail)) {
        issues = detail.map((d: { path?: string; message?: string; msg?: string }) => ({ path: d.path ?? "", level: "error" as const, message: d.message ?? d.msg ?? "Invalid" }));
        message = issues.map((i) => i.message).join("; ");
      }
    } catch { /* body was not JSON */ }
    throw new ApiError(res.status, message, issues);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
// endregion: request

export const getHealth = () => request<{ provider: string; model: string }>("/api/health");
export const getDocTypes = () => request<DocTypeInfo[]>("/api/doc-types");

export const extract = (doc_type: string, text: string, simulate_mistake: Mistake) =>
  request<ExtractionResult>("/api/extract", json({ doc_type, text, simulate_mistake }));

export const saveReview = (id: string, data: Data) => request<{ ok: boolean; data: Data }>(`/api/extractions/${id}/review`, json({ data }));

export function uploadForText(file: File) {
  const form = new FormData();
  form.append("file", file);
  return request<{ text: string; kind: string; pages?: number; truncated: boolean }>("/api/documents/text", { method: "POST", body: form });
}

export const listHistory = () => request<HistoryItem[]>("/api/extractions");
export const getExtraction = (id: string) =>
  request<{ id: string; doc_type: string; source_text: string; result: ExtractionResult; reviewed: Data | null }>(`/api/extractions/${id}`);
export const deleteExtraction = (id: string) => request<void>(`/api/extractions/${id}`, { method: "DELETE" });
