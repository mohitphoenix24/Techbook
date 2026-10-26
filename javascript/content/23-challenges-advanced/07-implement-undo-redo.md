---
title: Implement undo and redo (snapshots and commands)
level: hard
time: 40
summary: Two designs for undo/redo, snapshot history for immutable state and the command pattern for editors, with merging of rapid changes, a size limit, branch truncation and transactions.
---

:::problem Implement undo and redo {level=hard tags="design,command pattern,history,state"}
**Part 1: snapshot history** for immutable state (a form, a drawing, a settings page).

`createHistory(initial, { limit, mergeWindow, now })`:

- `set(next, { key })` stores a change. `undo()` and `redo()` move through states.
- A **new change after undo** removes the redo branch.
- Changes with the **same `key` within `mergeWindow` ms** are merged into one undo step (typing in a text field).
- At most `limit` steps are kept (the oldest is dropped).
- Setting the same value again is not a step.
- `canUndo`, `canRedo`.

**Part 2: command history** for a text editor, where copying the whole text for every key press is too costly.

- A command has `do()` and `undo()`, and optionally `merge(next)`.
- `History.execute(cmd)`, `undo()`, `redo()`, and `batch([...cmds])` as one step (a transaction).
- Typing consecutive characters merges into one command; deleting does not merge with typing.

:::hint Hint
Snapshots: three things, `past[]`, `present` and `future[]`. Commands: two stacks, `done` and `undone`. A transaction is a command whose `do` runs all children and whose `undo` runs them in **reverse**.
:::
:::

## Solution and tests

```js run title="Snapshot and command history, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

// ---------- Part 1: snapshot history ----------
function createHistory(initial, { limit = 100, mergeWindow = 0, now = Date.now } = {}) {
  let past = [], present = initial, future = [];
  let lastKey, lastTime = -Infinity;
  return {
    get state() { return present; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    set(next, { key } = {}) {
      if (Object.is(next, present)) return;                   // nothing changed: not a step
      const t = now();
      const merge = key !== undefined && key === lastKey && t - lastTime <= mergeWindow;
      if (!merge) {
        past.push(present);
        if (past.length > limit) past.shift();                // forget the oldest step
      }
      present = next; future = [];                            // a new change ends the redo branch
      lastKey = key; lastTime = t;
    },
    undo() {
      if (!past.length) return false;
      future.push(present); present = past.pop(); lastKey = undefined;     // after undo, the next change is always a new step
      return true;
    },
    redo() {
      if (!future.length) return false;
      past.push(present); present = future.pop(); lastKey = undefined;
      return true;
    },
  };
}

// ---------- Part 2: command history ----------
class History {
  #done = []; #undone = [];
  execute(cmd) {
    cmd.do();
    const last = this.#done.at(-1);
    if (last?.merge && last.merge(cmd)) { /* the new command was folded into the previous one */ }
    else this.#done.push(cmd);
    this.#undone = [];
  }
  undo() { const c = this.#done.pop(); if (!c) return false; c.undo(); this.#undone.push(c); return true; }
  redo() { const c = this.#undone.pop(); if (!c) return false; c.do(); this.#done.push(c); return true; }
  batch(cmds) {                                               // a transaction: one undo step for many commands
    this.execute({
      do: () => cmds.forEach((c) => c.do()),
      undo: () => [...cmds].reverse().forEach((c) => c.undo()),   // undo in REVERSE order
    });
  }
  get size() { return this.#done.length; }
}

class TextDoc { text = ""; }
const insert = (doc, pos, str) => ({
  type: "insert", pos, str,
  do() { doc.text = doc.text.slice(0, this.pos) + this.str + doc.text.slice(this.pos); },
  undo() { doc.text = doc.text.slice(0, this.pos) + doc.text.slice(this.pos + this.str.length); },
  merge(next) {                                               // typing right after the previous insert: extend it
    if (next.type !== "insert" || next.pos !== this.pos + this.str.length) return false;
    this.str += next.str;
    return true;
  },
});
const remove = (doc, pos, len) => {
  let removed = "";
  return {
    type: "delete",
    do() { removed = doc.text.slice(pos, pos + len); doc.text = doc.text.slice(0, pos) + doc.text.slice(pos + len); },
    undo() { doc.text = doc.text.slice(0, pos) + removed + doc.text.slice(pos); },
  };
};

// ---------------- tests ----------------
const clock = () => { let t = 0; const now = () => t; now.advance = (ms) => (t += ms); return now; };

test("snapshots: undo and redo walk through states", () => {
  const h = createHistory({ n: 0 });
  h.set({ n: 1 }); h.set({ n: 2 }); h.set({ n: 3 });
  h.undo(); h.undo();
  assert.equal(h.state.n, 1);
  h.redo();
  assert.equal(h.state.n, 2);
  assert.deepEqual([h.canUndo, h.canRedo], [true, true]);
});

test("a new change after undo removes the redo branch", () => {
  const h = createHistory(0);
  h.set(1); h.set(2); h.undo();
  h.set(9);
  assert.equal(h.canRedo, false);
  h.undo();
  assert.equal(h.state, 1);
});

test("setting the same value is not a step", () => {
  const h = createHistory(5);
  h.set(5);
  assert.equal(h.canUndo, false);
});

test("undo and redo at the ends do nothing", () => {
  const h = createHistory("x");
  assert.equal(h.undo(), false);
  assert.equal(h.redo(), false);
  assert.equal(h.state, "x");
});

test("the limit forgets the oldest steps", () => {
  const h = createHistory(0, { limit: 3 });
  for (let i = 1; i <= 10; i++) h.set(i);
  let steps = 0;
  while (h.undo()) steps++;
  assert.equal(steps, 3);
  assert.equal(h.state, 7);
});

test("rapid changes with the same key merge into one step", () => {
  const now = clock();
  const h = createHistory("", { mergeWindow: 500, now });
  for (const text of ["h", "he", "hel", "hell", "hello"]) { h.set(text, { key: "name" }); now.advance(100); }
  assert.equal(h.state, "hello");
  h.undo();
  assert.equal(h.state, "");                                  // all five keystrokes undone at once
});

test("a pause or another key starts a new step", () => {
  const now = clock();
  const h = createHistory({ name: "", age: 0 }, { mergeWindow: 500, now });
  h.set({ name: "A", age: 0 }, { key: "name" });
  now.advance(100);
  h.set({ name: "As", age: 0 }, { key: "name" });             // merged
  now.advance(100);
  h.set({ name: "As", age: 30 }, { key: "age" });             // another field: new step
  now.advance(2000);
  h.set({ name: "Asha", age: 30 }, { key: "name" });          // a long pause: new step
  h.undo();
  assert.deepEqual(h.state, { name: "As", age: 30 });
  h.undo();
  assert.deepEqual(h.state, { name: "As", age: 0 });
  h.undo();
  assert.deepEqual(h.state, { name: "", age: 0 });
});

test("commands: do, undo, redo", () => {
  const doc = new TextDoc(), h = new History();
  h.execute(insert(doc, 0, "Hello"));
  h.execute(remove(doc, 0, 1));
  assert.equal(doc.text, "ello");
  h.undo();
  assert.equal(doc.text, "Hello");
  h.redo();
  assert.equal(doc.text, "ello");
});

test("typing merges into one command; delete does not merge", () => {
  const doc = new TextDoc(), h = new History();
  "hello".split("").forEach((ch, i) => h.execute(insert(doc, i, ch)));
  assert.equal(h.size, 1);
  h.execute(remove(doc, 4, 1));
  assert.equal(h.size, 2);
  h.undo();
  assert.equal(doc.text, "hello");
  h.undo();
  assert.equal(doc.text, "");
});

test("typing at another place does not merge", () => {
  const doc = new TextDoc(), h = new History();
  h.execute(insert(doc, 0, "ab"));
  h.execute(insert(doc, 0, "X"));
  assert.equal(h.size, 2);
  assert.equal(doc.text, "Xab");
});

test("a transaction is one undo step, undone in reverse order", () => {
  const doc = new TextDoc(), h = new History();
  h.execute(insert(doc, 0, "abc"));
  h.batch([insert(doc, 3, "d"), remove(doc, 0, 1), insert(doc, 0, "Z")]);
  assert.equal(doc.text, "Zbcd");
  h.undo();
  assert.equal(doc.text, "abc");
});

test("executing after an undo clears the redo stack", () => {
  const doc = new TextDoc(), h = new History();
  h.execute(insert(doc, 0, "a"));
  h.undo();
  h.execute(insert(doc, 0, "b"));
  assert.equal(h.redo(), false);
  assert.equal(doc.text, "b");
});
```

## Choosing a design

| | Snapshots | Commands |
|---|---|---|
| Idea | keep old states | keep operations that can be reversed |
| Memory | one reference per state (cheap with **structural sharing**/Immer) | tiny per step |
| Complexity | very simple | each command needs a correct `undo` |
| Good for | forms, settings, whiteboards with immutable state | text editors, large documents, collaborative editing |
| Pitfall | copies of big mutable data | undo bugs when commands depend on state that changed |

Real editors (ProseMirror, CodeMirror, Figma) use commands/transactions, often with **operational transformation** or **CRDTs** for multi-user undo.

:::qa How would you undo in a collaborative editor? {level=hard}
**Say this:** "Global snapshots do not work, because they would also undo other people's edits. Undo must reverse **my** operations only, transformed against the operations others made since. That is why collaborative editors use operational transformation or CRDT-based undo managers (for example Yjs's `UndoManager`)."

**In simple words:** Undo my own edits, not everybody's.
:::

:::qa Why must a transaction undo its commands in reverse order? {level=medium}
**Say this:** "Later commands depend on the state the earlier ones produced (positions shift after an insert). Undoing the last one first restores the exact state it was applied to; undoing in forward order would use wrong positions."

**In simple words:** Take off your coat before your shirt, not the other way round.
:::

:::qa Why clear the redo stack on a new action? {level=easy}
**Say this:** "The redo steps were built on a state that no longer exists after the new change. Keeping them would apply them to the wrong state. Some editors keep a tree of branches instead, but a simple stack drops them."

**In simple words:** Once you take a new path, the old 'future' is gone.
:::

:::keypoints
- **Snapshots**: `past[]`, `present`, `future[]`; **new change clears `future`**; trim to a `limit`; ignore equal values.
- **Merge** rapid changes by `key` within a time window (typing); inject the **clock**.
- **Commands**: `do/undo` (+ `merge`); **batch = one step**, undone **in reverse**.
- Immutable state with **structural sharing** makes snapshots cheap; collaborative undo needs OT/CRDT.
:::
