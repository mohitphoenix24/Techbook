import type { Task } from "./types";

// region: dates
const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Whole days from `from` to `to`, both "YYYY-MM-DD". Done in UTC so daylight saving can never shift the answer. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}

/** "Today", "Tomorrow", "Yesterday", "Fri 24 Oct" (this year) or "24 Oct 2027". */
export function dueLabel(due: string, today: string): string {
  const diff = daysBetween(today, due);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const d = new Date(`${due}T00:00:00Z`);
  const base = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return due.slice(0, 4) === today.slice(0, 4) ? `${WEEKDAYS[d.getUTCDay()]} ${base}` : `${base} ${d.getUTCFullYear()}`;
}

export function localToday(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
// endregion: dates

// region: groups
export interface Group { key: "overdue" | "today" | "upcoming" | "someday" | "done"; title: string; tasks: Task[] }

/** Sort the board into sections. Empty sections are left out. */
export function groupTasks(tasks: Task[], today: string): Group[] {
  const open = tasks.filter((t) => !t.done);
  const groups: Group[] = [
    { key: "overdue", title: "Overdue", tasks: open.filter((t) => t.due !== null && t.due < today) },
    { key: "today", title: "Today", tasks: open.filter((t) => t.due === today) },
    { key: "upcoming", title: "Upcoming", tasks: open.filter((t) => t.due !== null && t.due > today) },
    { key: "someday", title: "No date", tasks: open.filter((t) => t.due === null) },
    { key: "done", title: "Done", tasks: tasks.filter((t) => t.done) },
  ];
  return groups.filter((g) => g.tasks.length > 0);
}
// endregion: groups

export const STEP_LABEL: Record<string, string> = {
  get_today: "Checked today's date",
  list_tasks: "Looked at your list",
  add_task: "Added a task",
  update_task: "Updated a task",
  delete_task: "Deleted a task",
};

export function describeInput(name: string, input: Record<string, unknown>): string {
  if (name === "add_task") return [input.title, input.due ? `due ${input.due}` : "", input.priority && input.priority !== "normal" ? `${input.priority} priority` : ""].filter(Boolean).join(" · ");
  if (name === "update_task") return Object.entries(input).map(([k, v]) => `${k}: ${v === null ? "none" : String(v)}`).join(" · ");
  if (name === "delete_task") return `#${String(input.id)}`;
  if (name === "list_tasks") return Object.entries(input).map(([k, v]) => `${k}: ${String(v)}`).join(" · ");
  return "";
}

// region: inline
export type Part = { kind: "text" | "bold" | "code"; text: string };

/** The chat shows plain text with **bold** and `code`. This splits a reply into those parts, so React can draw them
 *  as elements: no HTML is ever built from the model's text, so there is nothing to inject. */
export function inlineParts(text: string): Part[] {
  const parts: Part[] = [];
  for (const piece of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
    if (!piece) continue;
    if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4) parts.push({ kind: "bold", text: piece.slice(2, -2) });
    else if (piece.startsWith("`") && piece.endsWith("`") && piece.length > 2) parts.push({ kind: "code", text: piece.slice(1, -1) });
    else parts.push({ kind: "text", text: piece });
  }
  return parts;
}
// endregion: inline
