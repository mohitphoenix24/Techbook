---
title: How React renders: elements, the virtual DOM and reconciliation
level: advanced
time: 40
summary: What JSX compiles to, what a React element is, the render and commit phases, how reconciliation compares trees (types, keys), why keys matter, and a working mini-React (createElement, render, diff) in plain JavaScript.
---

## JSX is just function calls

```jsx
const element = <h1 className="title">Hello, {name}</h1>;
```

is compiled (by Babel, TypeScript or SWC) into:

```js
const element = jsx("h1", { className: "title", children: ["Hello, ", name] });   // modern runtime
// older: React.createElement("h1", { className: "title" }, "Hello, ", name)
```

and the result is a plain **JavaScript object** called a **React element**: a **description** of what you want on the screen. It is **not** a DOM node.

```js run title="A React element is just an object"
function createElement(type, props, ...children) {
  return { type, props: { ...props, children: children.flat() } };           // what React.createElement returns (simplified)
}

const element = createElement("ul", { id: "list" },
  createElement("li", { key: "a" }, "Tea"),
  createElement("li", { key: "b" }, "Coffee"),
);

console.log(JSON.stringify(element, null, 1).split("\n").slice(0, 12).join("\n"));
console.log(typeof element, element.type, element.props.children.length);
```

Elements are **cheap and immutable**. Creating thousands of them per render is fine. The expensive part is changing the **real DOM**, which React minimises.

## Components are functions that return elements

```jsx
function Greeting({ name }) {                  // a function component
  return <p>Hello, {name}</p>;                 // returns an element tree
}
<Greeting name="Asha" />                       // an element whose type is the FUNCTION Greeting
```

Components are called **with props** and must be **pure** with respect to props and state: same input → same output; no side effects while rendering.

## Render, then commit

```viz algo=chain title="Render phase vs commit phase"
node trigger "Trigger" @0,0
  note: setState, new props, parent re-render, context change
node render "Render phase" @1,0 [hl]
  note: call your components, build a new element tree, compare with the old tree. PURE, can be paused or restarted
node commit "Commit phase" @2,0 [ok]
  note: apply the minimal DOM changes, then run layout effects and effects. SYNCHRONOUS
link trigger -> render
link render -> commit
```

1. **Trigger:** state or props changed.
2. **Render:** React **calls your component functions** to get the new element tree, and **diffs** it against the previous one (reconciliation). No DOM is touched. In concurrent rendering this phase may be **paused, restarted or thrown away**, which is another reason render must be pure.
3. **Commit:** React applies the **smallest set of DOM operations**, then runs `useLayoutEffect`, then (after paint) `useEffect`.

"Render" in React means **calling your function**, **not** updating the screen. A component can "render" many times without changing a single DOM node.

## Reconciliation: how the diff works

Comparing two arbitrary trees is O(n³). React uses two **heuristics** to make it **O(n)**:

1. **Elements of different types produce different trees.** If `<div>` becomes `<span>`, or `<A>` becomes `<B>`, React **destroys the old subtree** (and its state) and builds a new one.
2. **Keys identify children** in lists. Same key = same item across renders (state is kept and it is only moved or updated).

For **same-type elements**, React keeps the DOM node and **updates only the changed props**; then it recurses into children.

| Old | New | What React does |
|---|---|---|
| `<div className="a">` | `<div className="b">` | same node, update `className` |
| `<div>` | `<section>` | **unmount** the div subtree (state lost), mount a new section |
| `<Counter/>` | `<Counter/>` | keep the instance and its **state**; give new props |
| `<Counter/>` | `<Timer/>` | unmount Counter, mount Timer |
| `[A, B]` | `[A, B, C]` | append C |
| `[A, B]` | `[B, A]` with **keys** | **move** the nodes |
| `[A, B]` | `[B, A]` with **no keys / index keys** | **update props** of both (state stays at the position!) |

### Why keys matter

```js run title="Index keys: state sticks to the position, not to the item"
// a mini model: each list position keeps an "input state" (what the user typed)
function reconcile(oldItems, newItems, keyOf) {
  const states = new Map(oldItems.map((item) => [keyOf(item, oldItems.indexOf(item)), item.typed]));
  return newItems.map((item, i) => ({ ...item, typed: states.get(keyOf(item, i)) }));         // state is looked up BY KEY
}

const before = [{ id: "a", label: "Tea", typed: "2 cups" }, { id: "b", label: "Coffee", typed: "1 cup" }];
const after = [{ id: "b", label: "Coffee" }, { id: "a", label: "Tea" }];                        // the list was reordered

console.log("by id   :", reconcile(before, after, (item) => item.id).map((x) => `${x.label}: ${x.typed}`));
console.log("by index:", reconcile(before, after, (item, i) => i).map((x) => `${x.label}: ${x.typed}`));   // typed text now sits on the WRONG row
```

Rules for keys:

- Use a **stable, unique id from your data** (`item.id`), not `Math.random()` (new key each render = remount every time) and **not the array index** when the list can be **reordered, filtered, or inserted into**.
- Keys only need to be unique **among siblings**. They are not passed as a prop.
- **Changing the `key` of a component deliberately resets its state** (a useful trick: `<Profile key={userId} />`).

## A mini React you can read in one screen

```js run title="mini-react: createElement, render to a tree, and a diff that returns DOM operations"
// 1. elements
const h = (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() });

// 2. "render": expand components into host elements (calling the functions)
function render(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node.type === "function") return render(node.type({ ...node.props, children: node.children }));   // call the component
  return { type: node.type, props: node.props, children: node.children.map(render) };
}

// 3. diff two rendered trees and produce the minimal list of operations
function diff(oldNode, newNode, path = "root", ops = []) {
  if (oldNode === undefined) ops.push(`CREATE ${path}`);
  else if (newNode === undefined) ops.push(`REMOVE ${path}`);
  else if (typeof oldNode === "string" || typeof newNode === "string") { if (oldNode !== newNode) ops.push(`TEXT ${path}: "${oldNode}" -> "${newNode}"`); }
  else if (oldNode.type !== newNode.type) ops.push(`REPLACE ${path}: <${oldNode.type}> -> <${newNode.type}> (subtree and its state are destroyed)`);
  else {
    for (const k of new Set([...Object.keys(oldNode.props), ...Object.keys(newNode.props)])) {
      if (k !== "key" && oldNode.props[k] !== newNode.props[k]) ops.push(`PROP ${path}.${k}: ${oldNode.props[k]} -> ${newNode.props[k]}`);
    }
    const len = Math.max(oldNode.children.length, newNode.children.length);
    for (let i = 0; i < len; i++) diff(oldNode.children[i], newNode.children[i], `${path}/${typeof (newNode.children[i] ?? oldNode.children[i]) === "string" ? "text" : (newNode.children[i] ?? oldNode.children[i]).type}[${i}]`, ops);
  }
  return ops;
}

// a component
const Card = ({ title, done, children }) => h("div", { className: done ? "card done" : "card" }, h("h2", {}, title), ...children);

const v1 = render(h(Card, { title: "Learn closures", done: false }, h("p", {}, "30 min")));
const v2 = render(h(Card, { title: "Learn closures", done: true }, h("p", {}, "45 min"), h("button", {}, "Share")));
const v3 = render(h("section", { className: "card" }, h("h2", {}, "Learn closures")));

console.log("v1 -> v2:\n  " + diff(v1, v2).join("\n  "));
console.log("v1 -> v3:\n  " + diff(v1, v3).join("\n  "));
```

Real React does the same **idea** with extra machinery: a **Fiber** tree (a linked structure of work units, which makes rendering **interruptible**), **lanes** (priorities), **hooks** state stored on each fiber, and an effect list to commit.

## Does the virtual DOM make React "fast"?

It is a **means**, not magic. Changing the real DOM is slow, so React lets you **describe** the UI as a function of state, then computes **what to change**. Direct DOM manipulation can be faster for a specific known change; the virtual DOM gives a **predictable, declarative model**. Newer approaches (Svelte, Solid, Vue Vapor) compile templates to **precise DOM updates** without diffing a virtual tree. Interviewers want you to say it **trades some CPU for a simpler programming model**.

:::interview What is the virtual DOM and how does reconciliation work? Why do keys matter?
"React components return React elements, which are plain JavaScript objects describing the UI. On a state change React runs the render phase: it calls the components, builds the new element tree, and compares it with the previous one. It uses two heuristics: elements of different types produce different trees, so the old subtree and its state are destroyed; and keys identify children in a list. For same-type elements it keeps the DOM node and updates changed props, then recurses. In the commit phase it applies the minimal DOM changes and runs effects. Keys let React match items across renders, so reordering moves nodes and keeps state with the right item; using array indexes on a dynamic list attaches state to positions, causing wrong state and extra work, and random keys remount everything."
:::

## More interview questions on this topic

:::qa What is a React element and how is it different from a component? {level=easy}
**Say this:** "An element is a plain object describing what to render (`{ type, props }`). A component is a function (or class) that takes props and returns elements."

**In simple words:** An element is a description; a component is a recipe that produces descriptions.
:::

:::qa What does "rendering" mean in React? {level=medium}
**Say this:** "Calling the component functions to compute the next element tree. It does not mean updating the DOM; DOM changes happen only in the commit phase, for the differences found."

**In simple words:** Render = think; commit = do.
:::

:::qa Why is it a bad idea to use the array index as a key? {level=medium}
**Say this:** "When items are inserted, removed or reordered, the same index points to a different item, so React reuses the wrong component instance and its state (typed input, focus, animations), and may do extra updates."

**In simple words:** The key must follow the item, not the seat number.
:::

:::qa What happens if you change a component's `key`? {level=hard}
**Say this:** "React treats it as a different component: the old instance unmounts (state and effects cleaned up) and a new one mounts. It is a deliberate way to reset state."

**In simple words:** New key = a brand new component.
:::

```quiz
? What does `<Greeting name="A" />` compile to?
- A DOM node
+ A call that returns an object: { type: Greeting, props: { name: "A" } }
- An HTML string
> JSX is syntax for creating elements.
? Which phase must be pure?
- Commit
+ Render
- Both are impure
> Render may be paused, repeated or discarded.
? When `<div>` is replaced by `<span>` at the same position, what happens to the subtree?
- It is kept
+ It is unmounted and rebuilt (state lost)
- It is moved
> Different types produce different trees.
```

:::keypoints
- **JSX → function calls → plain-object elements** (descriptions, not DOM nodes). Components = functions returning elements; keep render **pure**.
- **Render phase** (call components, diff; pure, can be interrupted) vs **commit phase** (minimal DOM changes, then effects).
- **Reconciliation heuristics**: different type → rebuild subtree (state lost); **keys** match list items. Use **stable ids**, not indexes or random values; **changing `key` resets state**.
- Fiber makes rendering interruptible. The virtual DOM trades CPU for a declarative model.
:::
