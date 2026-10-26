---
title: Implement an Immer-style produce
level: hard
time: 45
summary: Write produce(base, recipe) with copy-on-write Proxy drafts. Mutating code gives immutable results, unchanged parts keep their references, unchanged recipes return the same object, and drafts stop working afterwards.
---

:::problem Implement produce (copy-on-write drafts) {level=hard tags="proxy,immutability,structural sharing,react,redux"}
Immutable updates are safe for React and Redux, but writing `{ ...state, todos: state.todos.map(...) }` for deep changes is noisy. Immer lets you **write mutations** and get an **immutable result**:

```js
const next = produce(state, (draft) => {
  draft.todos[0].done = true;
  draft.todos.push({ id: 3, done: false });
});
```

Build `produce(base, recipe)`:

1. `recipe` receives a **draft** (a Proxy). Reads and writes on it work like on a normal object or array.
2. The `base` object is **never changed**.
3. **Structural sharing**: parts of the tree that were not changed keep the **same references** in the result.
4. If nothing changed, `produce` returns **`base` itself** (so `===` checks work).
5. Copy **lazily**: reading does not copy; only the objects on the path to a change are copied.
6. The result is **frozen**; a draft stops working (throws) after `produce` returns.
7. Arrays work with `push`, `splice`, `sort` and index assignment.
8. The recipe may instead **return** a new value, but not both modify and return.

:::hint Hint
Each draft has a state: `{ base, copy, modified, parent, children }`. A `get` of an object value returns a **child draft** (cached). The first write calls `markModified`, which makes a shallow `copy` of this node and of **all its parents**. At the end, `finalize` walks the modified nodes and puts the finished children into the copies.
:::
:::

## Solution and tests

```js run title="produce with Proxy drafts, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

const DRAFT = Symbol("draft");
const isDraftable = (v) => v !== null && typeof v === "object" && (Array.isArray(v) || [Object.prototype, null].includes(Object.getPrototypeOf(v)));
const shallowCopy = (v) => (Array.isArray(v) ? v.slice() : { ...v });

function markModified(state) {
  if (state.modified) return;
  state.modified = true;
  state.copy = shallowCopy(state.base);                      // copy-on-write: the first change copies this node...
  if (state.parent) markModified(state.parent);              // ...and every ancestor, so the new root points to the new nodes
}

function createDraft(base, parent, revokers) {
  const state = { base, copy: null, modified: false, parent, children: new Map() };
  const source = () => state.copy ?? state.base;             // read from the copy once it exists

  const handler = {
    get(_, key) {
      if (key === DRAFT) return state;
      const value = source()[key];
      if (value && value[DRAFT]) return value;               // a draft that was assigned somewhere else
      if (!isDraftable(value)) return value;                 // primitives, functions (array methods), Dates, Maps...
      const cached = state.children.get(key);
      if (cached && cached.state.base === value) return cached.proxy;
      const child = createDraft(value, state, revokers);     // lazy: a child draft is created only when it is read
      state.children.set(key, child);
      return child.proxy;
    },
    set(_, key, value) {
      const current = source()[key];
      if (value && value[DRAFT] && value[DRAFT].base === current) return true;     // draft.a = draft.a
      if (Object.is(current, value) && key in source()) return true;                // same value: no change at all
      markModified(state);
      state.copy[key] = value;
      state.children.delete(key);
      return true;
    },
    deleteProperty(_, key) {
      if (!(key in source())) return true;
      markModified(state);
      delete state.copy[key];
      state.children.delete(key);
      return true;
    },
    has: (_, key) => key in source(),
    ownKeys: () => Reflect.ownKeys(source()),
    getOwnPropertyDescriptor(_, key) {
      const desc = Reflect.getOwnPropertyDescriptor(source(), key);
      if (!desc) return undefined;
      if (Array.isArray(base) && key === "length") return { value: desc.value, writable: true, enumerable: false, configurable: false };   // must match the target's own "length"
      return { ...desc, configurable: true };
    },
    getPrototypeOf: () => Object.getPrototypeOf(base),
    defineProperty() { throw new Error("defineProperty is not supported on drafts"); },
    setPrototypeOf() { throw new Error("setPrototypeOf is not supported on drafts"); },
  };

  const { proxy, revoke } = Proxy.revocable(Array.isArray(base) ? [] : {}, handler);   // the target gives the proxy its "shape" (array or object)
  revokers.push(revoke);
  return { state, proxy };
}

function finalize(state) {
  if (!state.modified) return state.base;                    // untouched: share the original
  const copy = state.copy;
  for (const [key, child] of state.children) {
    if (copy[key] === child.state.base) copy[key] = finalize(child.state);          // replace the original child with its finished version
  }
  for (const key of Reflect.ownKeys(copy)) {
    const v = copy[key];
    if (v && v[DRAFT]) copy[key] = finalize(v[DRAFT]);       // a draft that was assigned to another place
  }
  return Object.freeze(copy);
}

function produce(base, recipe) {
  if (!isDraftable(base)) { const r = recipe(base); return r === undefined ? base : r; }
  const revokers = [];
  const root = createDraft(base, null, revokers);
  try {
    const returned = recipe(root.proxy);
    if (returned !== undefined && returned !== root.proxy) {
      if (root.state.modified) throw new Error("A recipe must either modify the draft or return a new value, not both");
      return returned;
    }
    return finalize(root.state);
  } finally {
    revokers.forEach((revoke) => revoke());                  // drafts are unusable after produce
  }
}

// ---------------- tests ----------------
const makeState = () => ({
  user: { name: "Asha", address: { city: "Pune" } },
  todos: [{ id: 1, done: false }, { id: 2, done: false }],
  meta: { version: 1 },
});

test("changes are applied and the base is untouched", () => {
  const base = makeState();
  const snapshot = JSON.stringify(base);
  const next = produce(base, (d) => { d.todos[0].done = true; d.user.address.city = "Delhi"; });
  assert.equal(next.todos[0].done, true);
  assert.equal(next.user.address.city, "Delhi");
  assert.equal(JSON.stringify(base), snapshot);
});

test("structural sharing: untouched parts keep their references", () => {
  const base = makeState();
  const next = produce(base, (d) => { d.todos[0].done = true; });
  assert.notEqual(next, base);
  assert.notEqual(next.todos, base.todos);
  assert.notEqual(next.todos[0], base.todos[0]);
  assert.equal(next.todos[1], base.todos[1]);                // sibling item: same object
  assert.equal(next.user, base.user);                        // other branches: same object
  assert.equal(next.meta, base.meta);
});

test("no change returns the same object", () => {
  const base = makeState();
  assert.equal(produce(base, () => {}), base);
  assert.equal(produce(base, (d) => { d.meta.version; d.todos[0].done; }), base);      // reading copies nothing
  assert.equal(produce(base, (d) => { d.meta.version = 1; }), base);                   // writing the same value is no change
});

test("arrays: push, splice, index set, sort", () => {
  const base = { list: [3, 1, 2] };
  assert.deepEqual(produce(base, (d) => { d.list.push(4); }).list, [3, 1, 2, 4]);
  assert.deepEqual(produce(base, (d) => { d.list.splice(1, 1); }).list, [3, 2]);
  assert.deepEqual(produce(base, (d) => { d.list[0] = 9; }).list, [9, 1, 2]);
  assert.deepEqual(produce(base, (d) => { d.list.sort(); }).list, [1, 2, 3]);
  assert.deepEqual(base.list, [3, 1, 2]);
});

test("delete and adding new keys", () => {
  const next = produce({ a: 1, b: 2 }, (d) => { delete d.a; d.c = 3; });
  assert.deepEqual(next, { b: 2, c: 3 });
});

test("the result is frozen", () => {
  const next = produce(makeState(), (d) => { d.meta.version = 2; });
  assert.throws(() => { next.meta.version = 3; }, TypeError);
  assert.throws(() => { next.x = 1; }, TypeError);
});

test("a draft is unusable after produce", () => {
  let leaked;
  produce(makeState(), (d) => { leaked = d; d.meta.version = 2; });
  assert.throws(() => leaked.meta, TypeError);
});

test("Object.keys, spread, JSON and Array.isArray work on drafts", () => {
  produce({ a: 1, b: { c: 2 }, list: [1, 2] }, (d) => {
    assert.deepEqual(Object.keys(d), ["a", "b", "list"]);
    assert.deepEqual({ ...d.b }, { c: 2 });
    assert.equal(JSON.stringify(d), '{"a":1,"b":{"c":2},"list":[1,2]}');
    assert.equal(Array.isArray(d.list), true);
    assert.equal("a" in d, true);
  });
});

test("moving a draft to another place keeps the changes", () => {
  const next = produce({ from: { v: 1 }, to: null }, (d) => { d.from.v = 2; d.to = d.from; });
  assert.deepEqual(next.to, { v: 2 });
});

test("returning a value replaces the state; mixing both is an error", () => {
  assert.deepEqual(produce({ a: 1 }, () => ({ replaced: true })), { replaced: true });
  assert.throws(() => produce({ a: 1 }, (d) => { d.a = 2; return { other: 1 }; }), /not both/);
});

test("only plain objects and arrays are drafted: Date and Map are values", () => {
  const base = { when: new Date(0), tags: new Map() };
  const next = produce(base, (d) => { d.extra = 1; });
  assert.equal(next.when, base.when);
  assert.equal(next.tags, base.tags);
});

test("a simple reducer written with produce", () => {
  const reducer = (state, action) => produce(state, (d) => {
    if (action.type === "toggle") { const t = d.todos.find((x) => x.id === action.id); if (t) t.done = !t.done; }
    if (action.type === "add") d.todos.push({ id: action.id, done: false });
  });
  let s = makeState();
  s = reducer(s, { type: "toggle", id: 2 });
  s = reducer(s, { type: "add", id: 3 });
  assert.deepEqual(s.todos.map((t) => [t.id, t.done]), [[1, false], [2, true], [3, false]]);
  assert.equal(reducer(s, { type: "toggle", id: 99 }), s);   // no-op action: same state, so React skips the render
});
```

## What this teaches

- **Why immutability?** Change detection by reference: React's `===` on props and state, `useMemo`, Redux selectors. A mutated object keeps its reference, so nothing notices.
- **Why not deep clone for every update?** It is O(size of state) and destroys sharing, so every memoised child re-renders. Structural sharing is O(depth of the change).
- **Proxy invariants**: the proxy's *target* must look like the real thing (an array for arrays, with its non-configurable `length`), or `getOwnPropertyDescriptor` and `ownKeys` throw.
- **Limits**: assigning a *new* object that contains drafts deeper is not handled here; Immer scans new objects for them. Immer also handles `Map`/`Set` (with a plugin), patches and `current()`.

:::qa How is this different from `structuredClone` followed by mutations? {level=medium}
**Say this:** "A clone copies everything and every reference changes, so every `memo` and selector sees new data. `produce` copies only the path to the changed node and shares the rest, and it returns the same object if nothing changed. That keeps renders cheap."

**In simple words:** Photocopy one page, not the whole book.
:::

:::qa Why does the first write copy all the parents too? {level=medium}
**Say this:** "Immutability must hold on the path from the root to the changed value: the parent has to point to the new child, so the parent is a new object, and so is its parent, up to the root. Siblings along the path are shared."

**In simple words:** A new leaf needs a new branch, a new branch needs a new trunk.
:::

:::qa Why revoke the proxies at the end? {level=hard}
**Say this:** "A draft that leaks (stored in a variable, used in an async callback) would still reference internal state. After `produce` finishes the copy is frozen, so writes through a leaked draft would be silently wrong or confusing. Revoking makes any later use throw a clear error."

**In simple words:** The draft is a pass for the recipe only; it expires when the recipe ends.
:::

:::keypoints
- **Draft = Proxy over a lazy copy-on-write node**; `get` returns child drafts, `set` calls **`markModified`** (copies the node and its ancestors).
- **Finalize** puts finished children into copies; **unchanged** subtrees keep their old references; **no change ⇒ same `base`**.
- Make the **proxy target** an array or object to match the base; implement `ownKeys`, `has`, `getOwnPropertyDescriptor`.
- **Freeze** results, **revoke** drafts; only plain objects and arrays are drafted.
:::
