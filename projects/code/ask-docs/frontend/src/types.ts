// region: types
export type DocStatus = "queued" | "parsing" | "embedding" | "ready" | "failed";

export interface DocumentInfo {
  id: string;
  title: string;
  filename: string;
  kind: "text" | "pdf";
  pages: number;
  status: DocStatus;
  error: string | null;
  n_chunks: number;
  progress: number;           // 0..1 while embedding
}

export interface Source {
  n: number;                  // the number the model cites: [n]
  chunk_id: number;
  document_id: string;
  document: string;
  page: number;
  heading: string;
  text: string;
  score: number;
  vector_score: number | null;
  keyword_score: number | null;
  vector_rank: number | null;
  keyword_rank: number | null;
}

export interface Citations { used: number[]; invalid: number[]; refused: boolean; uncited: boolean }
export interface Usage { input_tokens: number; output_tokens: number; cost_usd: number }

export type Mode = "hybrid" | "vector" | "keyword";
export interface AskSettings { mode: Mode; topK: number; documentIds: string[] | null }

export type AskEvent =
  | { type: "rewrite"; question: string; standalone: string; rewritten: boolean }
  | { type: "sources"; sources: Source[]; relevant: boolean }
  | { type: "delta"; text: string }
  | { type: "citations"; citations: Citations }
  | { type: "usage"; usage: Usage }
  | { type: "done" }
  | { type: "error"; code: string; message: string; retryable: boolean };

export interface ChunkDetail { id: number; document: string; page: number; heading: string; text: string; before: string | null; after: string | null }
// endregion: types
