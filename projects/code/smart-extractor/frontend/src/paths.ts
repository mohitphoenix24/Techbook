// Paths like "line_items.0.amount" address one value inside the extracted data.
// The server reports problems with these paths, so the form can show each message next to the right field.
import type { Data, Issue } from "./types";

// region: paths
export function getAt(data: unknown, path: string): unknown {
  return path === "" ? data : path.split(".").reduce<unknown>((node, key) => (node == null ? undefined : (node as Record<string, unknown>)[key]), data);
}

/** Return a copy of `data` with the value at `path` replaced. Never mutates: React needs a new object to redraw. */
export function setAt<T>(data: T, path: string, value: unknown): T {
  if (path === "") return value as T;
  const [head, ...rest] = path.split(".");
  const copy: any = Array.isArray(data) ? [...data] : { ...(data as object) };
  copy[head] = setAt(copy[head], rest.join("."), value);
  return copy;
}

/** Remove one item from the list at `path`. */
export function removeAt<T>(data: T, listPath: string, index: number): T {
  const list = getAt(data, listPath) as unknown[];
  return setAt(data, listPath, list.filter((_, i) => i !== index));
}

/** Group issues by the path they belong to. */
export function groupIssues(issues: Issue[]): Record<string, Issue[]> {
  const out: Record<string, Issue[]> = {};
  for (const issue of issues) (out[issue.path] ||= []).push(issue);
  return out;
}

/** An empty value of the right shape for a new list item, built from the field description. */
export function blankFor(node: { type: string; fields?: { name: string; type: string; fields?: any; item?: any; nullable: boolean; options?: string[] }[]; options?: string[]; nullable?: boolean }): unknown {
  switch (node.type) {
    case "object": return Object.fromEntries((node.fields ?? []).map((f) => [f.name, f.nullable ? null : blankFor(f)]));
    case "list": return [];
    case "number": return 0;
    case "boolean": return false;
    case "enum": return node.options?.[0] ?? "";
    default: return "";
  }
}

export const isDirty = (a: Data, b: Data) => JSON.stringify(a) !== JSON.stringify(b);
// endregion: paths
