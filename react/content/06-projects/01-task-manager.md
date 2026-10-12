---
title: Task Manager
level: easy
time: 40
icon: check
cover: #22c55e,#0ea5e9
tags: useReducer, localStorage, forms, filtering, undo
summary: A polished to-do app — add, edit in place, prioritise, filter, search, reorder, delete with undo, and keep everything after a reload. The perfect first complete React app, built on a tested reducer.
---

Every React developer should build one really good to-do app: it uses **almost every core skill** — state, events, forms, lists, keys, effects and a reducer — in a small space. Ours goes beyond the basics with inline editing, priorities, undo and persistence.

:::flow How it fits together
User action | click, type, keypress
dispatch(action) | "added", "toggled"…
tasksReducer | pure: old state → new state
React re-renders | filtered & sorted list
useEffect | save to localStorage
:::

**You'll practise:** `useReducer`, controlled forms, derived state (filters/search/stats), keys, inline editing with refs, `useEffect` for persistence, and an undo toast with timers.

## Step 1 — The reducer (pure logic, tested)

All the rules for changing tasks live in one **pure function**. Pure functions are easy to test — so we test it first.

```js run title="Step 1 · tasksReducer + tests"
function tasksReducer(tasks, action) {
  switch (action.type) {
    case "added":
      return [{ id: action.id, title: action.title, priority: action.priority, done: false }, ...tasks];
    case "toggled":
      return tasks.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t));
    case "edited":
      return tasks.map((t) => (t.id === action.id ? { ...t, title: action.title } : t));
    case "deleted":
      return tasks.filter((t) => t.id !== action.id);
    case "restored":                                   // undo a delete: put it back where it was
      return [...tasks.slice(0, action.index), action.task, ...tasks.slice(action.index)];
    case "moved": {
      const i = tasks.findIndex((t) => t.id === action.id);
      const j = i + action.by;
      if (i < 0 || j < 0 || j >= tasks.length) return tasks;
      const copy = [...tasks];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    }
    case "cleared_done":
      return tasks.filter((t) => !t.done);
    default:
      throw new Error("Unknown action: " + action.type);
  }
}

// --- quick tests ---
const check = (name, ok) => console.log(ok ? "✅" : "❌", name);
let s = [];
s = tasksReducer(s, { type: "added", id: "a", title: "Learn hooks", priority: "high" });
s = tasksReducer(s, { type: "added", id: "b", title: "Build app", priority: "low" });
check("newest first", s[0].id === "b");
s = tasksReducer(s, { type: "toggled", id: "a" });
check("toggle marks done", s.find((t) => t.id === "a").done === true);
const before = s;
s = tasksReducer(s, { type: "moved", id: "a", by: -1 });
check("move up swaps", s[0].id === "a" && before[0].id === "b");
check("old state untouched", before[0].id === "b");
const removed = s[0];
s = tasksReducer(s, { type: "deleted", id: "a" });
s = tasksReducer(s, { type: "restored", task: removed, index: 0 });
check("undo restores position", s[0].id === "a");
check("clear done", tasksReducer(s, { type: "cleared_done" }).length === 1);
```

## Step 2 — The complete app

```jsx run title="Task Manager · complete app"
import { useEffect, useMemo, useReducer, useRef, useState } from "react";

const STORAGE_KEY = "lab-tasks-v1";
const PRIORITIES = { high: { label: "High", color: "#ef4444", rank: 0 }, medium: { label: "Medium", color: "#f59e0b", rank: 1 }, low: { label: "Low", color: "#22c55e", rank: 2 } };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const SAMPLE = [
  { id: "t1", title: "Read the React 19 Actions lesson", priority: "high", done: false },
  { id: "t2", title: "Build the streaming chat project", priority: "medium", done: false },
  { id: "t3", title: "Set up Vite + TypeScript", priority: "low", done: true },
];

function tasksReducer(tasks, action) {
  switch (action.type) {
    case "added": return [{ id: newId(), title: action.title, priority: action.priority, done: false }, ...tasks];
    case "toggled": return tasks.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t));
    case "edited": return tasks.map((t) => (t.id === action.id ? { ...t, title: action.title } : t));
    case "deleted": return tasks.filter((t) => t.id !== action.id);
    case "restored": return [...tasks.slice(0, action.index), action.task, ...tasks.slice(action.index)];
    case "moved": {
      const i = tasks.findIndex((t) => t.id === action.id), j = i + action.by;
      if (i < 0 || j < 0 || j >= tasks.length) return tasks;
      const copy = [...tasks]; [copy[i], copy[j]] = [copy[j], copy[i]]; return copy;
    }
    case "cleared_done": return tasks.filter((t) => !t.done);
    default: throw new Error("Unknown action: " + action.type);
  }
}

function loadTasks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? SAMPLE; } catch { return SAMPLE; }
}

// ---------- add form ----------
function AddTask({ onAdd }) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim(), priority);
    setTitle("");
  }
  return (
    <form onSubmit={submit} className="row">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" aria-label="New task" style={{ flex: 1, minWidth: 160 }} />
      <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
        {Object.entries(PRIORITIES).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
      </select>
      <button className="primary" disabled={!title.trim()}>Add</button>
    </form>
  );
}

// ---------- one row, with inline editing ----------
function TaskItem({ task, dispatch, onDelete, isFirst, isLast }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current.select(); }, [editing]);

  function save() {
    const title = draft.trim();
    if (title && title !== task.title) dispatch({ type: "edited", id: task.id, title });
    else setDraft(task.title);
    setEditing(false);
  }

  return (
    <li className="card row" style={{ padding: "8px 10px", listStyle: "none", borderLeft: `4px solid ${PRIORITIES[task.priority].color}` }}>
      <input type="checkbox" checked={task.done} onChange={() => dispatch({ type: "toggled", id: task.id })} aria-label={`Mark "${task.title}" as done`} />
      {editing ? (
        <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setDraft(task.title); setEditing(false); } }}
          aria-label="Edit task" style={{ flex: 1 }} />
      ) : (
        <span onDoubleClick={() => setEditing(true)} title="Double-click to edit"
          style={{ flex: 1, textDecoration: task.done ? "line-through" : "none", opacity: task.done ? 0.55 : 1, cursor: "text" }}>
          {task.title}
        </span>
      )}
      <span className="row" style={{ gap: 2 }}>
        <button aria-label="Move up" disabled={isFirst} onClick={() => dispatch({ type: "moved", id: task.id, by: -1 })}>↑</button>
        <button aria-label="Move down" disabled={isLast} onClick={() => dispatch({ type: "moved", id: task.id, by: 1 })}>↓</button>
        <button aria-label="Edit" onClick={() => setEditing(true)}>✎</button>
        <button aria-label="Delete" onClick={() => onDelete(task)}>🗑</button>
      </span>
    </li>
  );
}

// ---------- the app ----------
export default function App() {
  const [tasks, dispatch] = useReducer(tasksReducer, null, loadTasks);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("manual");
  const [undo, setUndo] = useState(null);                 // { task, index }
  const undoTimer = useRef(0);

  useEffect(() => {                                       // persist on every change
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch {}
  }, [tasks]);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  function handleDelete(task) {
    const index = tasks.findIndex((t) => t.id === task.id);
    dispatch({ type: "deleted", id: task.id });
    setUndo({ task, index });
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 5000);
  }
  function handleUndo() {
    dispatch({ type: "restored", ...undo });
    setUndo(null);
  }

  // derived state — computed, never stored
  const visible = useMemo(() => {
    let list = tasks.filter((t) => (filter === "active" ? !t.done : filter === "done" ? t.done : true));
    if (query.trim()) list = list.filter((t) => t.title.toLowerCase().includes(query.toLowerCase()));
    if (sortBy === "priority") list = [...list].sort((a, b) => PRIORITIES[a.priority].rank - PRIORITIES[b.priority].rank);
    return list;
  }, [tasks, filter, query, sortBy]);
  const doneCount = tasks.filter((t) => t.done).length;
  const progress = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>✅ Tasks</h3>
        <small className="muted">{doneCount}/{tasks.length} done · {progress}%</small>
      </div>
      <div style={{ height: 6, background: "var(--card)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${progress}%`, height: "100%", background: "var(--ok)", transition: "width .3s" }} />
      </div>

      <AddTask onAdd={(title, priority) => dispatch({ type: "added", title, priority })} />

      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row" role="group" aria-label="Filter">
          {["all", "active", "done"].map((f) => (
            <button key={f} className={filter === f ? "primary" : ""} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
        <div className="row">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" aria-label="Search tasks" style={{ width: 120 }} />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort">
            <option value="manual">Manual order</option>
            <option value="priority">By priority</option>
          </select>
        </div>
      </div>

      <ul className="stack" style={{ padding: 0, margin: 0 }}>
        {visible.map((t, i) => (
          <TaskItem key={t.id} task={t} dispatch={dispatch} onDelete={handleDelete}
            isFirst={sortBy !== "manual" || i === 0} isLast={sortBy !== "manual" || i === visible.length - 1} />
        ))}
      </ul>
      {visible.length === 0 && <p className="muted" style={{ textAlign: "center" }}>{tasks.length ? "Nothing matches." : "No tasks yet — add one above ✨"}</p>}

      {doneCount > 0 && <button onClick={() => dispatch({ type: "cleared_done" })} style={{ alignSelf: "flex-start" }}>Clear {doneCount} completed</button>}

      {undo && (
        <div role="status" className="card row" style={{ justifyContent: "space-between", background: "var(--fg)", color: "var(--bg)" }}>
          <span>Deleted “{undo.task.title}”</span>
          <button onClick={handleUndo}>Undo</button>
        </div>
      )}
    </div>
  );
}
```

Try it: double-click a task to edit it (Enter saves, Escape cancels), delete one and press **Undo**, sort by priority, then press **Reload** on the preview — your tasks are still there.

## How it works

| Feature | Technique |
|---|---|
| all task changes | one pure `tasksReducer`, called with `dispatch({ type, … })` |
| load once on start | `useReducer(reducer, null, loadTasks)` — the **lazy initialiser** runs only on the first render |
| save automatically | `useEffect(() => save(tasks), [tasks])` |
| filters, search, sort, progress | **derived** with `useMemo` — never stored in state, so they can't get out of sync |
| inline edit | local `editing` state + a ref to select the text; `Escape` restores the old title |
| undo | remember `{ task, index }`, dispatch `restored`; a timer hides the toast |

:::exercise Extend it
1. Add **due dates** with an "Overdue" badge (compare with `new Date()`).
2. Add **drag and drop** reordering (see the Kanban project for the technique).
3. Add an **"✨ Break it down"** button that sends a task to your `/api/ask` backend and inserts the returned subtasks.
4. Move the state into a **Zustand** store with `persist`, and delete the manual `useEffect`.
:::

:::keypoints
- Put all update rules in a **pure reducer** and test it on its own.
- Use a lazy initialiser to load saved data once; save with an effect.
- Derive filtered/sorted lists and stats from state instead of storing copies.
- Small UX touches — inline edit, undo, keyboard support, empty states — make an app feel professional.
:::
