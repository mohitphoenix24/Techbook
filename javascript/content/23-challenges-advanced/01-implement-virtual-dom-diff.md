---
title: Implement a virtual DOM and diff
level: hard
time: 45
summary: Build h(), create, update and a keyed children reconciler over a tiny in-memory DOM, count the operations, and prove it with a fuzz test that compares an updated tree with a freshly built one.
---

:::problem Implement a virtual DOM with diffing {level=hard tags="react,reconciliation,diff,keys,testing"}
Build the core of a React-like renderer, but against a **tiny in-memory DOM** (plain objects), so it can be tested anywhere.

1. `h(type, props, ...children)` makes a virtual node. Strings and numbers become text nodes. `props.key` is the key.
2. `create(vnode)` builds the DOM nodes.
3. `update(dom, oldVnode, newVnode)` changes the **existing** DOM as little as possible:
   - different `type` ⇒ **replace** the whole subtree
   - same text ⇒ do nothing; different text ⇒ change it
   - props: set the changed ones, remove the missing ones
   - children: match old and new by **key** (or by **index** when there is no key); reuse the DOM node, create new ones, drop old ones, and **keep the new order**
4. Every change is written to an `ops` list, so tests can count the work.
5. Prove correctness: after `update`, the result must equal what `create(newVnode)` would give.

```js
const root = {};
render(root, h("ul", null, h("li", { key: "a" }, "A"), h("li", { key: "b" }, "B")));
render(root, h("ul", null, h("li", { key: "b" }, "B"), h("li", { key: "a" }, "A")));   // moves, no re-creation
```

:::hint Hint
For children, build a `Map` from key to `{ vnode, dom }` of the old list. Walk the new list: if the key exists, `update` that DOM node, else `create`. Anything left in the map is removed. The new `dom.children` array is the result of the walk.
:::
:::

## Solution and tests

```js run title="A small virtual DOM, with tests and a fuzz test"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

// ---------- virtual nodes ----------
const text = (v) => ({ type: "#text", props: { nodeValue: String(v) }, children: [], key: undefined });
function h(type, props, ...children) {
  return {
    type, props: props ?? {}, key: props?.key,
    children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false)
      .map((c) => (typeof c === "object" ? c : text(c))),
  };
}

// ---------- the tiny DOM ----------
function setProps(dom, oldProps, newProps, ops) {
  for (const k of Object.keys(oldProps)) {
    if (k !== "key" && !(k in newProps)) { delete dom.props[k]; ops.push(`remove prop ${k}`); }
  }
  for (const [k, v] of Object.entries(newProps)) {
    if (k !== "key" && oldProps[k] !== v) { dom.props[k] = v; ops.push(`set prop ${k}`); }
  }
}

function create(vnode, ops = []) {
  ops.push(`create ${vnode.type}`);
  const dom = { type: vnode.type, props: {}, children: [] };
  setProps(dom, {}, vnode.props, ops);
  for (const c of vnode.children) dom.children.push(create(c, ops));
  return dom;
}

function update(dom, oldV, newV, ops) {
  if (oldV.type !== newV.type) { ops.push(`replace ${oldV.type} with ${newV.type}`); return create(newV, ops); }   // different type: throw the subtree away
  if (newV.type === "#text") {
    if (oldV.props.nodeValue !== newV.props.nodeValue) { dom.props.nodeValue = newV.props.nodeValue; ops.push("set text"); }
    return dom;
  }
  setProps(dom, oldV.props, newV.props, ops);
  reconcileChildren(dom, oldV.children, newV.children, ops);
  return dom;
}

function reconcileChildren(dom, oldKids, newKids, ops) {
  const keyOf = (v, i) => (v.key !== undefined ? `k:${v.key}` : `i:${i}`);        // explicit key, or the position
  const old = new Map(oldKids.map((v, i) => [keyOf(v, i), { v, dom: dom.children[i] }]));
  const used = new Set();
  const next = newKids.map((nv, i) => {
    const k = keyOf(nv, i);
    const prev = old.get(k);
    if (prev && !used.has(k)) { used.add(k); return update(prev.dom, prev.v, nv, ops); }   // reuse the existing DOM node
    return create(nv, ops);
  });
  for (const [k, { v }] of old) if (!used.has(k)) ops.push(`remove ${v.type}`);
  dom.children = next;                                                            // this also carries the new order
}

function render(root, vnode) {
  const ops = [];
  root.dom = root.vnode ? update(root.dom, root.vnode, vnode, ops) : create(vnode, ops);
  root.vnode = vnode;
  return ops;
}

// ---------------- helpers for the tests ----------------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const toHTML = (d) => d.type === "#text" ? esc(d.props.nodeValue)
  : `<${d.type}${Object.entries(d.props).filter(([, v]) => typeof v !== "function").sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => ` ${k}="${esc(v)}"`).join("")}>${d.children.map(toHTML).join("")}</${d.type}>`;
const list = (...items) => h("ul", null, items.map(([k, label]) => h("li", { key: k }, label)));

// ---------------- tests ----------------
test("first render creates everything", () => {
  const root = {};
  const ops = render(root, h("div", { id: "a" }, h("p", null, "hi")));
  assert.deepEqual(ops, ["create div", "set prop id", "create p", "create #text", "set prop nodeValue"]);
  assert.equal(toHTML(root.dom), '<div id="a"><p>hi</p></div>');
});

test("rendering the same tree again does nothing", () => {
  const root = {};
  const tree = () => h("div", { id: "a" }, h("p", null, "hi"), "text");
  render(root, tree());
  assert.deepEqual(render(root, tree()), []);
});

test("a text change touches one node", () => {
  const root = {};
  render(root, h("p", null, "one"));
  assert.deepEqual(render(root, h("p", null, "two")), ["set text"]);
});

test("props are added, changed and removed", () => {
  const root = {};
  render(root, h("div", { a: 1, b: 2 }));
  assert.deepEqual(render(root, h("div", { b: 3, c: 4 })).sort(), ["remove prop a", "set prop b", "set prop c"]);
  assert.equal(toHTML(root.dom), '<div b="3" c="4"></div>');
});

test("a different type replaces the whole subtree", () => {
  const root = {};
  render(root, h("div", null, h("p", null, "a")));
  const ops = render(root, h("section", null, h("p", null, "a")));
  assert.equal(ops[0], "replace div with section");
  assert.ok(ops.includes("create p"));
});

test("keyed reorder keeps the DOM nodes (no creating, no removing)", () => {
  const root = {};
  render(root, list(["a", "A"], ["b", "B"], ["c", "C"]));
  const [a, b, c] = root.dom.children;
  const ops = render(root, list(["c", "C"], ["a", "A"], ["b", "B"]));
  assert.deepEqual(ops, []);                                                      // nothing to change inside the nodes
  assert.deepEqual(root.dom.children, [c, a, b]);
  assert.equal(root.dom.children[0], c);                                          // same objects, new order
});

test("keys: prepending is one create; without keys everything shifts", () => {
  const keyed = {}, plain = {};
  const items = ["x", "y", "z"];
  const keyedList = (arr) => h("ul", null, arr.map((s) => h("li", { key: s }, s)));
  const plainList = (arr) => h("ul", null, arr.map((s) => h("li", null, s)));
  render(keyed, keyedList(items)); render(plain, plainList(items));
  const keyedOps = render(keyed, keyedList(["new", ...items]));
  const plainOps = render(plain, plainList(["new", ...items]));
  assert.deepEqual(keyedOps, ["create li", "create #text", "set prop nodeValue"]);   // exactly one new item; nothing else touched
  assert.equal(plainOps.filter((o) => o === "set text").length, 3);              // every existing item got a new text...
  assert.equal(plainOps.filter((o) => o === "create li").length, 1);             // ...and one new item is created at the end
});

test("removed keys are removed", () => {
  const root = {};
  render(root, list(["a", "A"], ["b", "B"]));
  assert.deepEqual(render(root, list(["b", "B"])), ["remove li"]);
});

test("state is lost when the key changes (a new node is made)", () => {
  const root = {};
  render(root, list(["a", "A"]));
  const first = root.dom.children[0];
  render(root, list(["z", "A"]));
  assert.notEqual(root.dom.children[0], first);
});

test("inline functions as props change every render", () => {
  const root = {};
  render(root, h("button", { onClick: () => {} }, "x"));
  assert.deepEqual(render(root, h("button", { onClick: () => {} }, "x")), ["set prop onClick"]);
  const stable = () => {};
  render(root, h("button", { onClick: stable }, "x"));
  assert.deepEqual(render(root, h("button", { onClick: stable }, "x")), []);
});

// ---- a fuzz test: updating must give the same tree as building from scratch ----
let seed = 2024;
const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n);
let keyCounter = 0;
function randomVnode(depth = 0) {
  const props = {};
  for (const p of ["class", "id", "title"]) if (rand(3) === 0) props[p] = "v" + rand(3);
  const n = depth >= 3 ? 0 : rand(4);
  const useKeys = rand(2) === 0;
  const kids = Array.from({ length: n }, () => {
    if (rand(3) === 0) return "t" + rand(3);
    const kid = randomVnode(depth + 1);
    if (useKeys) kid.key = kid.props.key = "K" + (keyCounter++ % 6);             // keys repeat across renders but are unique among siblings below
    return kid;
  });
  const seen = new Set();
  const unique = kids.filter((k) => typeof k === "string" || k.key === undefined || (!seen.has(k.key) && seen.add(k.key)));
  return h(["div", "span", "p"][rand(3)], props, unique);
}

test("fuzz: update(old, new) equals create(new) for 400 random trees", () => {
  const root = {};
  render(root, randomVnode());
  for (let i = 0; i < 400; i++) {
    const next = randomVnode();
    render(root, next);
    assert.equal(toHTML(root.dom), toHTML(create(next)), "tree " + i);
  }
});
```

## What real React does on top of this

| This lesson | React |
|---|---|
| Match by key, else index | same rule (`key`, then position + type) |
| Rebuild the children array | uses a **longest increasing subsequence** to move as few DOM nodes as possible |
| Replace on a different type | same: state is lost for the whole subtree |
| Diff runs synchronously | **Fiber**: the work is split into units that can pause, resume and be given priorities |
| Props set directly | events are delegated, batched, with synthetic events |

## Rules that follow from the algorithm

- Keys must be **stable, unique among siblings** and not the array index when the list can change.
- Do not define components **inside** other components: a new function each render is a new `type`, so the whole subtree is replaced and loses state.
- The diff compares **only the same level**; moving a subtree to a different parent means re-creating it.

:::qa Why does React need keys at all, if it can compare by position? {level=medium}
**Say this:** "Position matching is wrong when items are inserted, removed or reordered: item states, input values and focus end up attached to the wrong item, and every item after an insert is updated. A key says which item is which, so React can move the node and keep its state."

**In simple words:** The key is the name tag on each item.
:::

:::qa Why is the diff O(n) and not O(n³) like a full tree diff? {level=hard}
**Say this:** "It uses two heuristics: elements of different types produce different trees (so it does not look inside), and keys tell which children are stable. With those, it needs one walk over each level."

**In simple words:** It guesses sensibly instead of searching for the best possible edit.
:::

:::qa How does the fuzz test give confidence? {level=medium}
**Say this:** "The property is: updating an old tree to a new one must equal creating the new tree from scratch. Random trees hit combinations I would not write by hand (type changes, key reuse, nested lists). If an optimisation breaks correctness, this finds it."

**In simple words:** Compare the clever way with the slow obvious way on thousands of random inputs.
:::

:::keypoints
- **create** builds nodes; **update** compares **type → text → props → children**; a different type **replaces** the subtree.
- Children: **Map by key (or index)**, reuse and update, create the new, remove the leftovers, keep the **new order**.
- Count the **ops** to see what a change really costs; stable props and keys reduce work.
- A **fuzz test** comparing `update` with `create` is a strong correctness check.
:::
