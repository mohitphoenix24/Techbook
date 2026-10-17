// region: types
/** One node of the form description the server builds from a Pydantic model (see backend/app/describe.py). */
export interface FieldNode {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "enum" | "list" | "object";
  nullable: boolean;
  description: string;
  options?: string[];          // enum
  item?: FieldNode;            // list
  fields?: FieldNode[];        // object
}

export interface Sample { id: string; title: string; text: string }
export interface DocTypeInfo { id: string; name: string; description: string; fields: FieldNode[]; samples: Sample[] }

export interface Issue { path: string; level: "error" | "warning"; message: string }
export interface Evidence { status: "found" | "missing"; start: number | null; end: number | null }
export interface Usage { input_tokens: number; output_tokens: number; cost_usd: number }

export type Data = Record<string, unknown>;

export interface ExtractionResult {
  id: string;
  doc_type: string;
  data: Data;
  valid: boolean;
  attempts: number;
  issues: Issue[];
  grounding: Record<string, Evidence>;
  usage: Usage;
  provider: string;
  model: string;
  duration_ms: number;
}

export type Mistake = "none" | "rule" | "invent";

export interface HistoryItem { id: string; doc_type: string; created_at: string; reviewed: boolean; valid: boolean; preview: string }
// endregion: types
