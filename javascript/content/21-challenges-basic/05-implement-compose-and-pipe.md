---
title: Implement compose and pipe
level: easy
time: 20
summary: Write pipe and compose with reduce, then an async version that waits for promises between steps. A small question that tests whether you understand reduce and function values.
---

:::problem Implement compose and pipe {level=easy tags="functional,reduce,composition"}
`pipe(f, g, h)(x)` runs **left to right**: `h(g(f(x)))`.
`compose(f, g, h)(x)` runs **right to left**: `f(g(h(x)))`.

1. Write `pipe` and `compose`. The first function in `pipe` may take several arguments; the others take one.
2. Calling them with **no functions** returns the input unchanged.
3. Write `pipeAsync` where any step may return a promise.

```js
const inc = (x) => x + 1;
const double = (x) => x * 2;
pipe(inc, double)(3);       // (3 + 1) * 2 = 8
compose(inc, double)(3);    // (3 * 2) + 1 = 7
```

:::hint Hint
Both are one `reduce` over the list of functions. `compose` is `pipe` with the list reversed.
:::
:::

## Solution and tests

```js run title="pipe, compose and pipeAsync, with tests"
const assert = require("node:assert/strict");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

const pipe = (...fns) => (...args) => {
  if (fns.length === 0) return args[0];                       // no functions: identity
  const [first, ...rest] = fns;
  return rest.reduce((acc, fn) => fn(acc), first(...args));   // the first one may take many arguments
};

const compose = (...fns) => pipe(...[...fns].reverse());      // same thing, reversed (copy first: reverse() mutates)

const pipeAsync = (...fns) => (input) => fns.reduce((p, fn) => p.then(fn), Promise.resolve(input));
// every step waits for the one before; a rejection skips the rest and reaches the caller

// ---------------- tests ----------------
const inc = (x) => x + 1;
const double = (x) => x * 2;
const square = (x) => x * x;

await test("pipe runs left to right", () => assert.equal(pipe(inc, double)(3), 8));
await test("compose runs right to left", () => assert.equal(compose(inc, double)(3), 7));
await test("three functions", () => {
  assert.equal(pipe(inc, double, square)(1), 16);       // ((1+1)*2)^2
  assert.equal(compose(inc, double, square)(3), 19);    // (3^2*2)+1
});
await test("first function can take several arguments", () => assert.equal(pipe((a, b) => a + b, double)(2, 3), 10));
await test("no functions returns the input", () => {
  assert.equal(pipe()(5), 5);
  assert.equal(compose()("x"), "x");
});
await test("compose does not reverse the caller's array", () => {
  const fns = [inc, double];
  compose(...fns)(1);
  assert.deepEqual(fns, [inc, double]);
});
await test("pipeAsync waits for promises", async () => {
  const slowInc = async (x) => { await new Promise((r) => setTimeout(r, 10)); return x + 1; };
  assert.equal(await pipeAsync(slowInc, double, slowInc)(1), 5);
});
await test("pipeAsync stops at the first rejection", async () => {
  let reached = false;
  const boom = () => { throw new Error("bad step"); };
  await assert.rejects(() => pipeAsync(inc, boom, () => { reached = true; })(1), /bad step/);
  assert.equal(reached, false);
});
```

## Where this is used

- **Redux middleware** and **Express middleware chains** are compositions.
- **Array pipelines** (`.map().filter()`) read like `pipe`, but build a new array at each step. `pipe` of small functions avoids that and is easier to test.
- The next-level topic is the **transducer**: one pass over the data with composed steps.

:::qa Why does `compose` use `reverse()` on a copy? {level=medium}
**Say this:** "`reverse()` changes the array in place. If the caller spreads the same array again, it would be reversed behind their back. Copy first, or use `reduceRight`."

**In simple words:** Do not change things that are not yours.
:::

:::qa How would you handle errors in a pipe of sync functions? {level=medium}
**Say this:** "A thrown error just exits the whole call, so the caller wraps the call in try/catch. For a pipeline that should not throw, use a `Result` / `Either` style: each step returns `{ok, value}` or `{ok:false, error}` and a small `chain` helper skips the rest after a failure."

**In simple words:** Either let it throw, or pass the failure along as a value.
:::

:::keypoints
- **pipe** = `reduce` left to right; **compose** = the same, reversed.
- Only the **first** function may take several arguments; the others receive one value.
- Handle the **empty list** (identity), and **copy** before `reverse()`.
- **pipeAsync** = chain with `.then`; one rejection skips the rest.
:::
