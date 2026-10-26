---
title: Generators, iterators, Map/Set and Proxy puzzles
level: advanced
time: 25
summary: Ten puzzles on generator control flow, iterator protocols, Set/Map semantics, symbols, Proxy traps and module behaviour.
---

## Puzzle 1: generator control flow

```js run title="Puzzle 1"
function* g() {
  console.log("start");
  const a = yield 1;
  console.log("a =", a);
  const b = yield 2;
  console.log("b =", b);
  return a + b;
}

const it = g();
console.log(it.next("ignored"));
console.log(it.next(10));
console.log(it.next(20));
console.log(it.next());
```

:::hint Show the reason
The first `next` argument is ignored and runs to the first `yield`. Then `a` is 10, `b` is 20, and the return value is 30. Output: `start`, `{ value: 1, done: false }`, `a = 10`, `{ value: 2, done: false }`, `b = 20`, `{ value: 30, done: true }`, `{ value: undefined, done: true }`.
:::

## Puzzle 2: spread and the return value

```js run title="Puzzle 2"
function* g() { yield 1; yield 2; return 3; }

console.log([...g()]);
for (const x of g()) console.log("for-of", x);
const it = g();
console.log(it.next(), it.next(), it.next(), it.next());
```

:::hint Show the reason
`for...of` and spread ignore the `return` value. Only `next()` shows it. Output: `[ 1, 2 ]`, `for-of 1`, `for-of 2`, then `{ value: 1, done: false } { value: 2, done: false } { value: 3, done: true } { value: undefined, done: true }`.
:::

## Puzzle 3: finally in generators

```js run title="Puzzle 3"
function* g() {
  try {
    yield 1;
    yield 2;
  } finally {
    console.log("cleanup");
  }
}

for (const x of g()) {
  console.log(x);
  break;
}
const [first] = g();
console.log("first:", first);
```

:::hint Show the reason
`break` and partial destructuring both call the iterator's `return()`, which runs the `finally` block. Output: `1`, `cleanup`, `cleanup`, `first: 1`. (The second `cleanup` appears before the log line, because destructuring finishes first.)
:::

## Puzzle 4: iterators are single-use

```js run title="Puzzle 4"
const arr = [1, 2, 3];
const it = arr[Symbol.iterator]();
console.log([...it].length, [...it].length);
console.log([...arr].length, [...arr].length);

function* gen() { yield 1; yield 2; }
const g = gen();
console.log([...g].length, [...g].length);
```

:::hint Show the reason
An iterator object is exhausted after one pass. The array (the iterable) creates a fresh iterator each time. Output: `3 0`, `3 3`, `2 0`.
:::

## Puzzle 5: Set and Map equality

```js run title="Puzzle 5"
const set = new Set([1, "1", 1, NaN, NaN, {}, {}, [], [], 0, -0]);
console.log(set.size);

const map = new Map([[NaN, "a"], [0, "b"]]);
console.log(map.get(NaN), map.get(-0), map.get("0"));
```

:::hint Show the reason
Distinct values: `1`, `"1"`, `NaN` (once), two different `{}`, two different `[]`, and `0`/`-0` count as one. That is `1, "1", NaN, {}, {}, [], [], 0` = **8**. The Map uses SameValueZero: `a b undefined`. Output: `8` then `a b undefined`.
:::

## Puzzle 6: symbols as keys

```js run title="Puzzle 6"
const a = Symbol("k");
const b = Symbol("k");
const o = { [a]: 1, [b]: 2, k: 3 };

console.log(Object.keys(o), JSON.stringify(o), o[a], o[Symbol("k")]);
console.log(Reflect.ownKeys(o).length, Symbol.for("x") === Symbol.for("x"), a.description === b.description);
```

:::hint Show the reason
Symbols are unique even with the same description. `Object.keys` and JSON ignore symbol keys. A new `Symbol("k")` is different from `a` and `b`, so `o[Symbol("k")]` is `undefined`. Output: `[ 'k' ] {"k":3} 1 undefined` then `3 true true`.
:::

## Puzzle 7: Proxy get/set trap order

```js run title="Puzzle 7"
const log = [];
const p = new Proxy({ n: 1 }, {
  get(t, k, r) { log.push("get " + String(k)); return Reflect.get(t, k, r); },
  set(t, k, v, r) { log.push("set " + String(k)); return Reflect.set(t, k, v, r); },
  has(t, k) { log.push("has " + String(k)); return Reflect.has(t, k); },
});

p.n++;
"n" in p;
p.m = p.n;
console.log(log);
```

:::hint Show the reason
`p.n++` reads then writes: `get n`, `set n`. `"n" in p` triggers `has n`. `p.m = p.n` first evaluates the right side (`get n`), then `set m`. Output: `[ 'get n', 'set n', 'has n', 'get n', 'set m' ]`.
:::

## Puzzle 8: Proxy and arrays

```js run title="Puzzle 8"
const log = [];
const arr = new Proxy([], { set(t, k, v, r) { log.push(`${String(k)}=${v}`); return Reflect.set(t, k, v, r); } });

arr.push("a", "b");
console.log(log);
```

:::hint Show the reason
`push` sets each index and then the `length` property. Output: `[ '0=a', '1=b', 'length=2' ]`. This is why Proxy sees array changes that `defineProperty` cannot.
:::

## Puzzle 9: destructuring a Map and a Set

```js run title="Puzzle 9"
const [[k1, v1], second] = new Map([["a", 1], ["b", 2]]);
const [x, ...rest] = new Set([10, 20, 30]);
const { size, has } = new Set([1]);

console.log(k1, v1, second, x, rest, size, typeof has);
```

:::hint Show the reason
A Map yields `[key, value]` pairs; a Set yields values. `size` is a getter on the prototype, which destructuring can read. `has` is a method (a function). Output: `a 1 [ 'b', 2 ] 10 [ 20, 30 ] 1 function`.
:::

## Puzzle 10: dynamic import and module caching

```js run node title="Puzzle 10"
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m-"));
fs.writeFileSync(path.join(dir, "m.mjs"), `console.log("evaluated"); export let n = 0; export const inc = () => ++n;`);
const url = pathToFileURL(path.join(dir, "m.mjs")).href;

(async () => {
  const a = await import(url);
  const b = await import(url);
  a.inc();
  console.log(a === b, a.n, b.n);
  fs.rmSync(dir, { recursive: true });
})();
```

:::hint Show the reason
The module is evaluated once and cached; both imports return the same namespace object, with live bindings. Output: `evaluated`, then `true 1 1`.
:::

:::keypoints
- **Generators**: the first `next` argument is ignored; `return` is invisible to `for...of`; `break` runs `finally`.
- **Iterators** are single-use; **iterables** create a new iterator each time.
- **Set/Map** use SameValueZero: `NaN` once, `0 === -0`, objects by reference.
- **Symbols** are always unique: they are ignored by `Object.keys` and JSON.
- **Proxy** sees every read, write, `in` and array index/length change. **Modules** are evaluated once.
:::
