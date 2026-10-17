// region: types
export interface RepoSummary {
  id: string;
  name: string;
  builtin: boolean;
  files: number;
  chunks: number;
  lines: number;
  languages: Record<string, number>;
  skipped: number;
  skipped_examples: { path: string; why: string }[];
}

export interface TreeEntry { path: string; lines: number; chunks: number }

/** One piece of code the search found (or the call graph added), and why. */
export interface Hit {
  path: string;
  start: number;
  end: number;
  kind: string;
  name: string;
  score: number;
  reasons: string[];
  expanded: boolean;
}

export type CitationStatus = "valid" | "outside_context" | "bad_lines" | "no_such_file";
export interface CitationItem { path: string; start: number; end: number; status: CitationStatus }
export interface Usage { input_tokens: number; output_tokens: number; cost_usd: number }

/** The events one question streams. */
export type AskEvent =
  | { type: "retrieval"; hits: Hit[]; terms: string[] }
  | { type: "delta"; text: string }
  | { type: "citations"; items: CitationItem[]; uncited: boolean }
  | ({ type: "usage" } & Usage)
  | { type: "done" }
  | { type: "error"; code: string; message: string; retryable: boolean };
// endregion: types
