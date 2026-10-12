---
title: Kanban Board with Drag & Drop
level: intermediate
time: 55
icon: layers
cover: #8b5cf6,#06b6d4
tags: drag and drop, normalized state, useReducer, accessibility, WIP limits
summary: A Trello-style board for an ML team — drag cards between columns (with a keyboard alternative), add and edit cards, labels, WIP limits, filters and persistence, built on normalised state.
---

Kanban boards are a classic interview and portfolio project because they need **careful state design**. Cards move between columns, get reordered, filtered and edited — and all of that should stay simple. The secret is **normalised state**.

:::def Normalised state
Storing each item **once**, by id, and referring to it by id everywhere else — like tables in a database. Columns hold lists of card ids; cards live in a single lookup object. Moving a card just moves an id.
:::

```js
// ❌ nested: moving a card means copying it between arrays and updating it in two places
{ columns: [{ id: "todo", cards: [{ id: "c1", title: "…" }] }] }

// ✅ normalised: cards by id, columns hold ids
{ cards: { c1: { id: "c1", title: "…" } }, columns: { todo: { title: "To do", cardIds: ["c1"] } }, order: ["todo", "doing", "done"] }
```

**You'll practise:** normalised state with `useReducer`, the HTML Drag and Drop API, drop-position calculation, an accessible keyboard alternative, derived filters and WIP limits.

## Step 1 — The move logic

One function moves a card from any position to any position — including within the same column.

```js run title="Step 1 · moveCard"
function moveCard(state, { cardId, toColumn, toIndex }) {
  const fromColumn = state.order.find((c) => state.columns[c].cardIds.includes(cardId));
  const fromIds = state.columns[fromColumn].cardIds.filter((id) => id !== cardId);
  const toIds = fromColumn === toColumn ? fromIds : [...state.columns[toColumn].cardIds];
  const index = Math.max(0, Math.min(toIndex, toIds.length));
  toIds.splice(index, 0, cardId);
  return {
    ...state,
    columns: { ...state.columns, [fromColumn]: { ...state.columns[fromColumn], cardIds: fromIds }, [toColumn]: { ...state.columns[toColumn], cardIds: toIds } },
  };
}

const s0 = { order: ["todo", "done"], columns: { todo: { cardIds: ["a", "b", "c"] }, done: { cardIds: ["d"] } } };
const show = (s) => s.order.map((c) => `${c}: [${s.columns[c].cardIds}]`).join("  ");
console.log("start         ", show(s0));
console.log("a → done, 0   ", show(moveCard(s0, { cardId: "a", toColumn: "done", toIndex: 0 })));
console.log("c → todo, 0   ", show(moveCard(s0, { cardId: "c", toColumn: "todo", toIndex: 0 })));
console.log("a → todo, end ", show(moveCard(s0, { cardId: "a", toColumn: "todo", toIndex: 99 })));
console.log("unchanged?    ", show(s0));
```

## Step 2 — The complete board

```jsx run title="Kanban · complete app"
import { useEffect, useReducer, useState } from "react";

const KEY = "lab-kanban-v1";
const LABELS = { data: "#0ea5e9", model: "#8b5cf6", eval: "#f59e0b", infra: "#22c55e", bug: "#ef4444" };
const WIP_LIMIT = 3;
const newId = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const INITIAL = {
  order: ["todo", "doing", "review", "done"],
  columns: {
    todo: { title: "To do", cardIds: ["c1", "c2", "c3"] },
    doing: { title: "In progress", cardIds: ["c4", "c5"] },
    review: { title: "Review", cardIds: ["c6"] },
    done: { title: "Done", cardIds: ["c7"] },
  },
  cards: {
    c1: { id: "c1", title: "Collect 500 support tickets", label: "data" },
    c2: { id: "c2", title: "Write eval rubric for answers", label: "eval" },
    c3: { id: "c3", title: "Fix tokenizer crash on emoji", label: "bug" },
    c4: { id: "c4", title: "Chunk docs by headings", label: "data" },
    c5: { id: "c5", title: "Try reranker on top-20", label: "model" },
    c6: { id: "c6", title: "Streaming endpoint + Stop", label: "infra" },
    c7: { id: "c7", title: "Set up vector index", label: "infra" },
  },
};

function moveCard(state, { cardId, toColumn, toIndex }) {
  const fromColumn = state.order.find((c) => state.columns[c].cardIds.includes(cardId));
  const fromIds = state.columns[fromColumn].cardIds.filter((id) => id !== cardId);
  const toIds = fromColumn === toColumn ? fromIds : [...state.columns[toColumn].cardIds];
  toIds.splice(Math.max(0, Math.min(toIndex, toIds.length)), 0, cardId);
  return { ...state, columns: { ...state.columns, [fromColumn]: { ...state.columns[fromColumn], cardIds: fromIds }, [toColumn]: { ...state.columns[toColumn], cardIds: toIds } } };
}

function reducer(state, action) {
  switch (action.type) {
    case "moved": return moveCard(state, action);
    case "added": {
      const card = { id: newId(), title: action.title, label: action.label };
      const col = state.columns[action.column];
      return { ...state, cards: { ...state.cards, [card.id]: card }, columns: { ...state.columns, [action.column]: { ...col, cardIds: [...col.cardIds, card.id] } } };
    }
    case "edited": return { ...state, cards: { ...state.cards, [action.id]: { ...state.cards[action.id], ...action.patch } } };
    case "deleted": {
      const { [action.id]: _removed, ...cards } = state.cards;
      const columns = Object.fromEntries(Object.entries(state.columns).map(([k, c]) => [k, { ...c, cardIds: c.cardIds.filter((id) => id !== action.id) }]));
      return { ...state, cards, columns };
    }
    case "reset": return INITIAL;
    default: throw new Error(action.type);
  }
}

function Card({ card, columnId, index, state, dispatch, dimmed, onDragStart, dragging }) {
  const [editing, setEditing] = useState(false);
  const col = state.order.indexOf(columnId);
  const move = (dCol, dIdx) => {
    const toColumn = state.order[col + dCol];
    dispatch({ type: "moved", cardId: card.id, toColumn, toIndex: dCol ? state.columns[toColumn].cardIds.length : index + dIdx });
  };
  return (
    <div draggable={!editing} onDragStart={(e) => { e.dataTransfer.setData("text/plain", card.id); e.dataTransfer.effectAllowed = "move"; onDragStart(card.id); }}
      className="card" data-card-id={card.id}
      style={{ padding: "8px 10px", cursor: "grab", opacity: dragging ? 0.4 : dimmed ? 0.25 : 1, borderLeft: `4px solid ${LABELS[card.label]}` }}>
      {editing ? (
        <input autoFocus defaultValue={card.title} aria-label="Card title" style={{ width: "100%" }}
          onBlur={(e) => { dispatch({ type: "edited", id: card.id, patch: { title: e.target.value.trim() || card.title } }); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(false); }} />
      ) : (
        <div onDoubleClick={() => setEditing(true)} style={{ fontSize: 14 }}>{card.title}</div>
      )}
      <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
        <small style={{ color: LABELS[card.label] }}>● {card.label}</small>
        <span className="row" style={{ gap: 0 }}>
          {[["←", -1, 0, col === 0], ["↑", 0, -1, index === 0], ["↓", 0, 1, index === state.columns[columnId].cardIds.length - 1], ["→", 1, 0, col === state.order.length - 1]].map(([sym, dc, di, disabled]) => (
            <button key={sym} disabled={disabled} onClick={() => move(dc, di)} aria-label={`Move ${card.title} ${{ "←": "left", "→": "right", "↑": "up", "↓": "down" }[sym]}`}
              style={{ padding: "0 5px", fontSize: 12, border: 0, background: "none" }}>{sym}</button>
          ))}
          <button onClick={() => dispatch({ type: "deleted", id: card.id })} aria-label={`Delete ${card.title}`} style={{ padding: "0 5px", fontSize: 12, border: 0, background: "none" }}>✕</button>
        </span>
      </div>
    </div>
  );
}

function Column({ id, state, dispatch, filter, draggingId, setDraggingId }) {
  const column = state.columns[id];
  const [dropIndex, setDropIndex] = useState(null);
  const [adding, setAdding] = useState(false);
  const overLimit = id === "doing" && column.cardIds.length > WIP_LIMIT;

  function indexFromPointer(e) {                          // where in the list is the pointer?
    const cards = [...e.currentTarget.querySelectorAll("[data-card-id]")];
    const i = cards.findIndex((el) => e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2);
    return i === -1 ? cards.length : i;
  }

  return (
    <section aria-label={column.title}
      onDragOver={(e) => { e.preventDefault(); setDropIndex(indexFromPointer(e)); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropIndex(null); }}
      onDrop={(e) => {
        e.preventDefault();
        const cardId = e.dataTransfer.getData("text/plain");
        let toIndex = indexFromPointer(e);
        const from = column.cardIds.indexOf(cardId);
        if (from !== -1 && from < toIndex) toIndex -= 1;     // same column: account for the card being removed
        dispatch({ type: "moved", cardId, toColumn: id, toIndex });
        setDropIndex(null); setDraggingId(null);
      }}
      className="stack"
      style={{ flex: "1 1 0", minWidth: 150, background: "color-mix(in srgb, var(--card) 60%, transparent)", border: `1px ${dropIndex !== null ? "dashed var(--accent)" : "solid var(--border)"}`, borderRadius: 12, padding: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b style={{ fontSize: 14 }}>{column.title}</b>
        <small className={overLimit ? "error" : "muted"} title={id === "doing" ? `WIP limit ${WIP_LIMIT}` : undefined}>
          {column.cardIds.length}{id === "doing" ? `/${WIP_LIMIT}` : ""}
        </small>
      </div>
      {overLimit && <small className="error">Over the WIP limit — finish something first!</small>}
      {column.cardIds.map((cid, i) => (
        <div key={cid}>
          {dropIndex === i && <div style={{ height: 3, background: "var(--accent)", borderRadius: 2, margin: "2px 0" }} />}
          <Card card={state.cards[cid]} columnId={id} index={i} state={state} dispatch={dispatch}
            dimmed={filter && state.cards[cid].label !== filter} dragging={draggingId === cid} onDragStart={setDraggingId} />
        </div>
      ))}
      {dropIndex === column.cardIds.length && <div style={{ height: 3, background: "var(--accent)", borderRadius: 2 }} />}
      {adding ? (
        <form className="stack" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (f.get("title").trim()) dispatch({ type: "added", column: id, title: f.get("title").trim(), label: f.get("label") });
          setAdding(false);
        }}>
          <input name="title" autoFocus placeholder="Card title" aria-label="New card title" />
          <div className="row">
            <select name="label" aria-label="Label">{Object.keys(LABELS).map((l) => <option key={l}>{l}</option>)}</select>
            <button className="primary" style={{ padding: "4px 10px" }}>Add</button>
            <button type="button" onClick={() => setAdding(false)} style={{ padding: "4px 8px" }}>✕</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} style={{ background: "none", borderStyle: "dashed" }}>＋ Add card</button>
      )}
    </section>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, null, () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? INITIAL; } catch { return INITIAL; } });
  const [filter, setFilter] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }, [state]);

  const total = Object.keys(state.cards).length;
  const done = state.columns.done.cardIds.length;

  return (
    <div className="stack" onDragEnd={() => setDraggingId(null)}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row" style={{ gap: 4 }}>
          <b>🧪 ML Sprint</b>
          <small className="muted">· {done}/{total} done</small>
        </div>
        <div className="row" style={{ gap: 4 }}>
          {Object.entries(LABELS).map(([l, c]) => (
            <button key={l} onClick={() => setFilter(filter === l ? null : l)} aria-pressed={filter === l}
              style={{ padding: "1px 8px", fontSize: 12, borderColor: c, background: filter === l ? c : "transparent", color: filter === l ? "white" : c }}>{l}</button>
          ))}
          <button onClick={() => dispatch({ type: "reset" })} style={{ padding: "1px 8px", fontSize: 12 }}>Reset</button>
        </div>
      </div>
      <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4 }}>
        {state.order.map((id) => <Column key={id} id={id} state={state} dispatch={dispatch} filter={filter} draggingId={draggingId} setDraggingId={setDraggingId} />)}
      </div>
      <small className="muted">Drag cards between columns, or use the ← ↑ ↓ → buttons (keyboard friendly). Double-click a title to edit.</small>
    </div>
  );
}
```

## How it works

| Feature | Technique |
|---|---|
| state shape | **normalised**: `cards` by id, `columns[].cardIds`, `order` for column order |
| one move function | handles between-column and within-column moves, clamps the index |
| drag & drop | `draggable` + `dataTransfer.setData(id)`; `onDragOver` must call `preventDefault()` to allow dropping |
| drop position | compare the pointer's `clientY` with each card's vertical midpoint |
| accessibility | arrow buttons with clear `aria-label`s do every move without a mouse |
| WIP limit | derived from `cardIds.length` — a warning, not a hard block |
| filters | dim (don't hide) non-matching cards, so positions stay stable while filtering |

:::tip Libraries for production
For touch screens, smooth animations and complex lists, use **dnd-kit** (`@dnd-kit/core`, `@dnd-kit/sortable`): it supports pointer, touch and keyboard sensors and screen-reader announcements out of the box.
:::

:::exercise Extend it
1. Add **assignees** with avatars and a "my cards" filter.
2. Add an **✨ Auto-label** button that sends a new card's title to your backend and sets the label the model picks (validate it against the allowed labels!).
3. Animate moves with the **View Transitions** API (`<ViewTransition>` from the React 19 module).
4. Sync the board to a server with **optimistic updates** (TanStack Query `onMutate` + rollback).
:::

:::keypoints
- Normalise state: items by id + lists of ids. Moving or editing becomes a tiny, safe update.
- Write one well-tested move function; the UI (drag, buttons, keyboard) just calls it.
- HTML5 drag and drop needs `draggable`, `dataTransfer`, and `preventDefault()` in `onDragOver`.
- Always provide a non-drag alternative for keyboard and assistive-tech users.
:::
