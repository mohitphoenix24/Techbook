---
title: Pure functions, side effects and immutability
level: intermediate
time: 30
summary: What makes a function pure, why side effects and shared mutable state cause bugs, and how to update objects and arrays without changing them (spread, map/filter, structuredClone, freeze).
---

## Pure functions

A function is **pure** if:

1. **Same input → same output.** Always. It does not depend on hidden data (time, random numbers, globals).
2. **No side effects.** It does not change anything outside itself (variables, objects passed in, files, the network, the screen).

```js run title="Pure vs impure"
// Pure: only depends on its arguments, changes nothing
const addTax = (price, rate) => price + (price * rate) / 100;

// Impure 1: depends on hidden state
let rate = 18;
const addTaxImpure = (price) => price + (price * rate) / 100;

// Impure 2: has a side effect (mutates its input)
const addItemImpure = (cart, item) => { cart.push(item); return cart; };

// Impure 3: not deterministic
const orderId = () => "ORD-" + Math.floor(Math.random() * 1000);

console.log(addTax(100, 18));
console.log(addTaxImpure(100));
rate = 5;
console.log(addTaxImpure(100));            // same input, different output: impure
```

:::analogy A calculator vs a bank clerk
A calculator is pure: `7 × 6` is always `42` and it touches nothing else. A bank clerk is impure: the answer to "what is my balance?" depends on what happened earlier, and "deposit" changes the world.
:::

## Why purity helps

- **Easy to test**: no setup, no mocks. Just input and expected output.
- **Easy to reason about**: you only need to look at the function.
- **Safe to cache** (memoize), reorder and run in parallel.
- **No surprises** from shared state.

:::note Real programs need side effects
Without side effects, nothing would be saved, sent or shown. The idea is **not to avoid all of them**, but to keep the **core logic pure** and push side effects (I/O, DOM, network) to the **edges**.
:::

## Mutation: the usual source of bugs

```js run title="Mutation surprises"
const original = { name: "Asha", skills: ["JS"] };
const copy = original;                      // NOT a copy: the same object

copy.skills.push("Node");
console.log(original.skills);               // original changed too

function addSkill(user, skill) {
  user.skills.push(skill);                  // mutates the caller's object
}
addSkill(original, "React");
console.log(original.skills);
```

Several parts of a program sharing one mutable object can change it at any time. Bugs appear far away from their cause, and UI frameworks like React cannot **detect** the change.

## Immutable updates: make a new value instead

**Arrays:**

```js run title="Immutable array updates"
const items = ["a", "b", "c"];

const added = [...items, "d"];                       // add at the end
const addedFirst = ["z", ...items];                  // add at the start
const removed = items.filter((x) => x !== "b");      // remove by value
const replaced = items.map((x) => (x === "b" ? "B" : x));   // change one
const inserted = [...items.slice(0, 1), "new", ...items.slice(1)];   // insert at index 1
const sorted = items.toSorted((a, b) => b.localeCompare(a));          // ES2023: copy then sort
const changedAt = items.with(2, "C");                // ES2023: copy with one index replaced

console.log(items);
console.log(added, addedFirst, removed);
console.log(replaced, inserted, sorted, changedAt);
```

**Objects:**

```js run title="Immutable object updates"
const state = {
  user: { name: "Asha", address: { city: "Pune", pin: "411001" } },
  theme: "dark",
};

// change a deeply nested value: copy each level on the path
const moved = {
  ...state,
  user: {
    ...state.user,
    address: { ...state.user.address, city: "Mumbai" },
  },
};

console.log(state.user.address.city, moved.user.address.city);
console.log(state.theme === moved.theme);                       // untouched parts are SHARED
console.log(state.user.address === moved.user.address);         // changed path: new objects
```

This is **structural sharing**: only the changed path is copied; unchanged parts are reused. That makes it cheap, and it allows quick change detection with `===`, which React relies on.

```js run title="Remove a key immutably, and update an item in a list"
const { password, ...safeUser } = { name: "Asha", password: "secret", role: "admin" };
console.log(safeUser);

const todos = [{ id: 1, done: false }, { id: 2, done: false }];
const toggled = todos.map((t) => (t.id === 2 ? { ...t, done: true } : t));
console.log(todos[1].done, toggled[1].done, todos[0] === toggled[0]);
```

## Spread is only shallow

```js run title="Spread copies one level"
const a = { n: 1, inner: { x: 1 } };
const b = { ...a };
b.inner.x = 99;                              // the nested object is SHARED
console.log(a.inner.x);

const c = structuredClone(a);                // deep copy
c.inner.x = 5;
console.log(a.inner.x);
```

We cover deep copy in detail in [module 12](#/l/shallow-vs-deep-copy).

## Preventing mutation: `Object.freeze`

```js run title="freeze is shallow and silent in sloppy mode, loud in strict mode"
const config = Object.freeze({ port: 3000, db: { host: "localhost" } });

try { config.port = 4000; } catch (e) { console.log(e.name + ": " + e.message); }
config.db.host = "remote";                   // freeze is shallow: nested object is still mutable
console.log(config.port, config.db.host);

function deepFreeze(obj) {
  Object.values(obj).forEach((v) => { if (typeof v === "object" && v !== null) deepFreeze(v); });
  return Object.freeze(obj);
}
const strict = deepFreeze({ a: { b: { c: 1 } } });
try { strict.a.b.c = 2; } catch (e) { console.log("deep frozen:", e.name); }
```

## Side effects in practice: keep them at the edges

```js run title="Pure core, impure shell"
// pure core: easy to test
const calculateTotal = (items) => items.reduce((sum, i) => sum + i.price * i.qty, 0);
const applyCoupon = (total, coupon) => (coupon === "SAVE10" ? total * 0.9 : total);
const formatPrice = (n) => `₹${n.toFixed(2)}`;

// impure shell: does the I/O, calls the pure functions
function checkout(cart, coupon) {
  const total = applyCoupon(calculateTotal(cart), coupon);
  console.log("charging", formatPrice(total));        // side effect at the edge
}

checkout([{ price: 100, qty: 2 }, { price: 50, qty: 1 }], "SAVE10");
```

:::interview What is a pure function? Why does immutability matter, especially in React?
"A pure function returns the same output for the same input and has no side effects: it does not mutate its arguments or outside state. That makes it testable, cacheable and easy to reason about. Immutability means updating data by creating a new copy instead of changing the old one, with spread, `map`, `filter` or `structuredClone`. In React and Redux, state changes are detected by reference comparison, so if I mutate the existing object, the reference stays the same and the UI may not update. With immutable updates, a changed object has a new reference, and unchanged parts are shared (structural sharing), so comparison is cheap."
:::

## More interview questions on this topic

:::qa Is `console.log` inside a function a side effect? {level=easy}
**Say this:** "Yes. It writes to the outside world, so the function is not pure. It is harmless for debugging, but it breaks strict purity."

**In simple words:** Anything the function does besides returning a value is a side effect.
:::

:::qa Does `const` make an object immutable? {level=easy}
**Say this:** "No, it only stops re-assigning the variable. Use `Object.freeze` for (shallow) immutability, or copy-on-write updates."

**In simple words:** const locks the name, freeze locks the object.
:::

:::qa What is structural sharing? {level=hard}
**Say this:** "When creating an updated copy of a nested structure, only the objects on the changed path are copied. All unchanged subtrees are reused by reference, which saves memory and makes equality checks fast."

**In simple words:** Copy only what changed; point to the rest.
:::

:::qa Which array methods mutate and which do not? {level=medium}
**Say this:** "Mutating: `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin`. Non-mutating: `map`, `filter`, `slice`, `concat`, `flat`, and the ES2023 copies `toSorted`, `toReversed`, `toSpliced`, `with`."

**In simple words:** If it changes the array and returns the same array, it mutates.
:::

```quiz
? Which makes a function impure?
- Using a parameter
+ Reading Math.random() or mutating an argument
- Returning an object
> Same input must give same output, with no outside changes.
? Does `{ ...obj }` create a deep copy?
- Yes
+ No, only the first level is copied
- Only for arrays
> Nested objects stay shared.
? Why does React need new object references when updating state?
- Because it likes new objects
+ It compares references to detect changes
- Because mutation is a syntax error
> Same reference means "nothing changed" to React.
```

:::keypoints
- **Pure**: same input → same output, no side effects. Easy to test, cache, reason about.
- Keep a **pure core** and push side effects to the **edges**.
- **Immutable updates**: spread, `map`, `filter`, `toSorted`, `with`, `structuredClone`. Spread is shallow.
- `const` ≠ immutable. `Object.freeze` is shallow.
- Structural sharing makes immutability cheap and enables `===` change detection.
:::
