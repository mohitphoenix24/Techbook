// region: types
export type Role = "agent" | "lead";
export interface Me { name: string; role: Role }

export type Status = "new" | "drafted" | "needs_lead" | "approved" | "sent" | "rejected" | "escalated" | "closed";
export type Priority = "urgent" | "high" | "normal" | "low";

export interface Triage {
  category: string;
  priority: Priority;
  sentiment: "negative" | "neutral" | "positive";
  language: string;
  order_ids: string[];
  summary: string;
  needs_human: boolean;
}

export interface Check { name: string; ok: boolean; severity: "block" | "warn"; detail: string }
export interface Decision { action: string; code: string; reason: string; amount: number; needs_lead: boolean; article: string }

export interface Draft {
  version: number;
  text: string;
  policy: Decision;
  checks: Check[];
  citations: string[];
  sources: string[];
  source: "model" | "human";
  author: string;
  created_at: string;
}

export interface AuditEntry { ts: string; actor: string; role: string; action: string; detail: string }

export interface TicketSummary {
  id: number;
  subject: string;
  from_email: string;
  status: Status;
  created_at: string;
  channel: string;
  category: string | null;
  priority: Priority | null;
  sentiment: string | null;
  summary: string | null;
}

export interface Ticket extends Omit<TicketSummary, "category" | "priority" | "sentiment" | "summary"> {
  body: string;
  triage: Triage | null;
  redactions: Record<string, number> | null;
  draft: Draft | null;
  actions: string[];                       // the buttons this person may press: the server decides, the browser only draws
  audit: AuditEntry[];
  messages: { created_at: string; text: string; sent_by: string }[];
  has_trace: boolean;
}

export interface Span { id: number; parent: number | null; name: string; start_ms: number; duration_ms: number; status: "ok" | "error"; attrs: Record<string, unknown> }
export interface TraceSummary { spans: number; duration_ms: number; cost_usd: number; tokens: number; errors: number; stages: string[] }
export interface Trace { id: number; created_at: string; summary: TraceSummary; spans: Span[] }

export interface Metrics {
  tickets: number;
  by_status: Record<string, number>;
  processed_runs: number;
  avg_cost_usd: number;
  avg_duration_ms: number;
  approved: number;
  rejected: number;
  sent: number;
  approval_rate: number | null;
  edit_rate: number | null;
  gateway: { calls: number; cache_hits: number; retries: number; fallbacks: number; rate_limited: number; budget_blocked: number; failures: number; cost_usd: number;
             breakers: Record<string, string>; spent_today_usd: Record<string, number> };
}

/** The events the server streams while the copilot works on one ticket. */
export type PipelineEvent =
  | { type: "stage"; name: string; status: "start" | "done"; ms?: number; summary?: string; [extra: string]: unknown }
  | { type: "delta"; text: string }
  | { type: "reset" }
  | { type: "draft"; draft: Draft }
  | { type: "error"; code: string; message: string; retryable: boolean }
  | { type: "done"; status: Status; trace: TraceSummary };

export type Simulate = "none" | "overpromise" | "leak" | "wrong_amount" | "stubborn" | "flaky";
// endregion: types
