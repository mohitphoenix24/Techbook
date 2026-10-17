// region: format
/** 211881 -> "2,11,881": the Indian way of grouping digits (the last three, then pairs). */
export function inr(n: number): string {
  const whole = Math.round(Math.abs(n)).toString();
  const head = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return "₹" + (n < 0 ? "-" : "") + (head ? head + "," : "") + whole.slice(-3);
}

export function usd(n: number): string {
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

/** "3 min ago", "2 h ago", "5 days ago": enough precision for an inbox. */
export function ago(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

export const STATUS_LABEL: Record<string, string> = {
  new: "New", drafted: "Draft ready", needs_lead: "Needs team lead", approved: "Approved", sent: "Sent", rejected: "Rejected", escalated: "Needs a person", closed: "Closed",
};

export const ACTION_LABEL: Record<string, string> = {
  process: "processed", edit: "edited the draft", approve: "approved", reject: "rejected", send: "sent the reply", close: "closed", process_failed: "tried to process (failed)",
};
// endregion: format
