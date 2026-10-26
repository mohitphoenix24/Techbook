---
title: Node.js event loop and module puzzles
level: advanced
time: 30
summary: Eleven Node.js puzzles on nextTick, promises, timers, setImmediate, I/O callbacks, module caching, exports and circular requires. These are the Node-specific questions asked in senior interviews.
---

Most puzzles here are **CommonJS files**, because that is where `nextTick` comes first. Remember: in an **ES module**, promise microtasks run **before** `nextTick`.

## Puzzle 1: the classic order

```js run cjs node nondet title="Puzzle 1"
console.log("1");
setTimeout(() => console.log("2 timeout"), 0);
setImmediate(() => console.log("3 immediate"));
process.nextTick(() => console.log("4 nextTick"));
Promise.resolve().then(() => console.log("5 promise"));
console.log("6");
```

:::hint Show the reason
Sync: `1`, `6`. Then nextTick (`4 nextTick`), then promise (`5 promise`). Then the loop: timers and check. From the main module, `2 timeout` and `3 immediate` can come in **either order** (it is nondeterministic): a good answer says so. If the loop starts before 1 ms has passed, `3 immediate` comes first; if the process was slow to start, `2 timeout` comes first.
:::

## Puzzle 2: in an I/O callback

```js run cjs node title="Puzzle 2"
const fs = require("node:fs");

fs.readFile(process.argv[1], () => {
  setTimeout(() => console.log("timeout"), 0);
  setImmediate(() => console.log("immediate"));
  process.nextTick(() => console.log("nextTick"));
});
```

:::hint Show the reason
Inside the poll phase callback: `nextTick` right after the callback, then `immediate` (check phase), then `timeout` (next loop). Output: `nextTick`, `immediate`, `timeout`.
:::

## Puzzle 3: nextTick inside promises inside nextTick

```js run cjs node title="Puzzle 3"
Promise.resolve().then(() => {
  console.log("promise 1");
  process.nextTick(() => console.log("nextTick from promise"));
}).then(() => console.log("promise 2"));

process.nextTick(() => {
  console.log("nextTick 1");
  Promise.resolve().then(() => console.log("promise from nextTick"));
});
```

:::hint Show the reason
Node drains the **nextTick queue first**: `nextTick 1` (it queues a microtask). Then it drains the **whole microtask queue**: `promise 1` (which queues a nextTick and the next promise `promise 2`), then `promise from nextTick`, then `promise 2`. Only when the microtask queue is completely empty does Node look at the nextTick queue again: `nextTick from promise`. Output: `nextTick 1`, `promise 1`, `promise from nextTick`, `promise 2`, `nextTick from promise`.
:::

## Puzzle 4: the same in an ES module

```js run esm node title="Puzzle 4"
setTimeout(() => console.log("timeout"), 0);
process.nextTick(() => console.log("nextTick"));
Promise.resolve().then(() => console.log("promise"));
console.log("sync");
```

:::hint Show the reason
In an ES module the top-level code runs inside a promise job, so the microtask queue is drained **before** the nextTick queue. Output: `sync`, `promise`, `nextTick`, `timeout`.
:::

## Puzzle 5: async/await and nextTick

```js run cjs node title="Puzzle 5"
async function a() {
  console.log("a start");
  await null;
  console.log("a after await");
}

process.nextTick(() => console.log("nextTick"));
a();
Promise.resolve().then(() => console.log("then"));
console.log("sync end");
```

:::hint Show the reason
Sync: `a start`, `sync end`. Then nextTick: `nextTick`. Then microtasks in queued order: `a after await`, `then`. Output: `a start`, `sync end`, `nextTick`, `a after await`, `then`.
:::

## Puzzle 6: setTimeout ordering

```js run cjs node nondet title="Puzzle 6"
setTimeout(() => console.log("A 10"), 10);
setTimeout(() => console.log("B 0"), 0);
setTimeout(() => console.log("C 1"), 1);
setImmediate(() => console.log("D immediate"));
setTimeout(() => console.log("E 5"), 5);
```

:::hint Show the reason
`0` is treated as `1`, so B and C tie and keep creation order (B, C). E (5) and A (10) follow. `D` (immediate) usually runs before the timers when the first loop iteration starts before 1 ms has elapsed, but it can also come after B and C. Output (typical): `D immediate`, `B 0`, `C 1`, `E 5`, `A 10`.
:::

## Puzzle 7: module caching

```js run cjs node title="Puzzle 7"
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p7-"));
fs.writeFileSync(path.join(dir, "m.js"), `let n = 0; module.exports = { next: () => ++n };`);
const file = path.join(dir, "m.js");

const a = require(file);
const b = require(file);
console.log(a.next(), b.next(), a === b);

delete require.cache[require.resolve(file)];
const c = require(file);
console.log(c.next(), a.next(), c === a);
fs.rmSync(dir, { recursive: true });
```

:::hint Show the reason
`a` and `b` are the same cached object: `1 2 true`. After deleting the cache entry, `require` loads a **fresh copy** with its own `n`: `c.next()` is `1`, while `a.next()` continues its own counter: `3`. Output: `1 2 true` then `1 3 false`.
:::

## Puzzle 8: exports vs module.exports

```js run cjs node title="Puzzle 8"
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p8-"));
const w = (n, c) => fs.writeFileSync(path.join(dir, n), c);
w("one.js", `exports.x = 1; module.exports.y = 2;`);
w("two.js", `exports.x = 1; module.exports = { y: 2 };`);
w("three.js", `module.exports = { y: 2 }; exports.x = 1;`);
w("four.js", `exports = module.exports = { z: 3 }; exports.x = 1;`);

for (const f of ["one", "two", "three", "four"]) console.log(f, require(path.join(dir, f + ".js")));
fs.rmSync(dir, { recursive: true });
```

:::hint Show the reason
`one`: both add to the same object → `{ x: 1, y: 2 }`. `two`: `module.exports` is replaced after `x` was added to the old object → `{ y: 2 }`. `three`: replaced first, then `exports.x` goes to the **old** object → `{ y: 2 }`. `four`: `exports` is re-pointed to the new object, so `exports.x` is added to it → `{ z: 3, x: 1 }`.
:::

## Puzzle 9: setInterval and a blocked loop

```js run cjs node title="Puzzle 9" nondet
const start = Date.now();
let ticks = 0;
const id = setInterval(() => {
  ticks++;
  if (ticks === 3) { clearInterval(id); console.log("ticks:", ticks, "| elapsed >= 300:", Date.now() - start >= 300); }
}, 100);

const block = Date.now() + 250;
while (Date.now() < block) {}                           // blocks the loop for 250 ms right at the start
```

:::hint Show the reason
The busy loop blocks the first ticks. The interval cannot run during the block, so the first callback runs at about 250 ms (not 100). Intervals do not "catch up" with multiple callbacks: the next ticks come later at their normal period. Total elapsed is about 450 ms. Output: `ticks: 3 | elapsed >= 300: true`.
:::

## Puzzle 10: unhandled rejection vs uncaught exception

```js run cjs node title="Puzzle 10"
process.on("uncaughtException", (e) => console.log("uncaughtException:", e.message));
process.on("unhandledRejection", (r) => console.log("unhandledRejection:", r.message));

setTimeout(() => { throw new Error("thrown in a timer"); }, 0);
Promise.reject(new Error("rejected promise"));
new Promise(() => { throw new Error("thrown in an executor"); });
process.nextTick(() => console.log("nextTick runs first"));
```

:::hint Show the reason
`nextTick runs first`. Rejections are reported after the microtask queue drains: `unhandledRejection: rejected promise`, `unhandledRejection: thrown in an executor`. The thrown error in the timer is a synchronous exception in a later callback: `uncaughtException: thrown in a timer`.
:::

## Puzzle 11: a circular require

```js run cjs node title="Puzzle 11"
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p11-"));
const w = (n, c) => fs.writeFileSync(path.join(dir, n), c);
w("a.js", `console.log("a starts"); exports.done = false; const b = require("./b"); console.log("in a, b.done =", b.done); exports.done = true; console.log("a ends");`);
w("b.js", `console.log("b starts"); exports.done = false; const a = require("./a"); console.log("in b, a.done =", a.done); exports.done = true; console.log("b ends");`);
w("main.js", `console.log("main starts"); const a = require("./a"); const b = require("./b"); console.log("in main: a.done =", a.done, "b.done =", b.done);`);
require(path.join(dir, "main.js"));
fs.rmSync(dir, { recursive: true });
```

:::hint Show the reason
The official Node docs example. `main` requires `a`. `a` requires `b`. `b` requires `a` again and gets a's **partial** export (`done: false`). `b` finishes (`b ends`), then `a` continues with a complete `b` (`b.done = true`). Output: `main starts`, `a starts`, `b starts`, `in b, a.done = false`, `b ends`, `in a, b.done = true`, `a ends`, `in main: a.done = true b.done = true`.
:::

:::keypoints
- **CommonJS:** sync → nextTick → promises → timers/immediate/I/O. **ES module:** sync → promises → nextTick.
- In an **I/O callback**: nextTick/promises, then `setImmediate`, then `setTimeout`.
- `timeout 0` vs `setImmediate` from the **main module** is **not guaranteed**.
- **Module cache**: one instance per file; deleting `require.cache` gives a fresh one. `exports` vs `module.exports`: order of assignment matters.
- **Circular require** → partial exports. Timers cannot interrupt a blocked loop; intervals do not catch up.
:::
