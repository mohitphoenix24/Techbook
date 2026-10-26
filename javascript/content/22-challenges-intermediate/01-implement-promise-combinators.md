---
title: Implement Promise.all, allSettled, race and any
level: medium
time: 30
summary: Write the four Promise combinators yourself. Handle non-promise values, empty input, ordering of results, and the AggregateError of any.
---

:::problem Implement the Promise combinators {level=medium tags="promises,async,combinators"}
Write `myAll`, `myAllSettled`, `myRace` and `myAny`. Each takes an **iterable** of values or promises and returns a promise.

| Function | Fulfils when | Rejects when |
|---|---|---|
| `myAll` | all fulfil, with an array of values **in input order** | the **first** one rejects |
| `myAllSettled` | all are settled, with `{status, value}` or `{status, reason}` | never |
| `myRace` | the first one settles (either way) | the first one rejects |
| `myAny` | the **first fulfilment** | **all** reject, with an `AggregateError` |

Details:

- Plain values (not promises) count as already fulfilled.
- An **empty** input: `all` and `allSettled` fulfil with `[]`; `any` rejects; `race` stays pending forever.
- The order of results follows the **input order**, not the finishing order.

```js
await myAll([1, Promise.resolve(2), delay(10, 3)]);   // [1, 2, 3]
```

:::hint Hint
Wrap each item with `Promise.resolve(item)`. Keep a `remaining` counter and a `results` array; write `results[index]`, not `push`.
:::
:::

## Solution and tests

```js run title="The four combinators, with tests"
const assert = require("node:assert/strict");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };
const delay = (ms, value, fail) => new Promise((res, rej) => setTimeout(() => (fail ? rej(value) : res(value)), ms));

function myAll(iterable) {
  return new Promise((resolve, reject) => {
    const items = Array.from(iterable);
    const results = new Array(items.length);
    let remaining = items.length;
    if (remaining === 0) return resolve(results);
    items.forEach((item, i) => {
      Promise.resolve(item).then((value) => {
        results[i] = value;                                  // by index: input order, not finishing order
        if (--remaining === 0) resolve(results);
      }, reject);                                            // the first rejection wins; later calls are ignored
    });
  });
}

function myAllSettled(iterable) {
  const items = Array.from(iterable);
  return myAll(items.map((item) =>
    Promise.resolve(item).then(
      (value) => ({ status: "fulfilled", value }),
      (reason) => ({ status: "rejected", reason }),          // turn a rejection into a normal value
    )));
}

function myRace(iterable) {
  return new Promise((resolve, reject) => {
    for (const item of iterable) Promise.resolve(item).then(resolve, reject);   // the first to settle calls resolve or reject
  });
}

function myAny(iterable) {
  return new Promise((resolve, reject) => {
    const items = Array.from(iterable);
    const errors = new Array(items.length);
    let remaining = items.length;
    if (remaining === 0) return reject(new AggregateError([], "All promises were rejected"));
    items.forEach((item, i) => {
      Promise.resolve(item).then(resolve, (err) => {
        errors[i] = err;
        if (--remaining === 0) reject(new AggregateError(errors, "All promises were rejected"));
      });
    });
  });
}

// ---------------- tests ----------------
await test("all: values and promises, in input order", async () => {
  const r = await myAll([delay(40, "slow"), 7, delay(5, "fast")]);
  assert.deepEqual(r, ["slow", 7, "fast"]);
});
await test("all: first rejection wins", async () => {
  await assert.rejects(myAll([delay(30, "late"), delay(5, new Error("early"), true)]), /early/);
});
await test("all: empty input fulfils with an empty array", async () => assert.deepEqual(await myAll([]), []));
await test("all: accepts any iterable", async () => assert.deepEqual(await myAll(new Set([1, 2])), [1, 2]));

await test("allSettled: never rejects", async () => {
  const r = await myAllSettled([1, Promise.reject(new Error("x")), delay(5, "ok")]);
  assert.equal(r[0].status, "fulfilled");
  assert.equal(r[1].status, "rejected");
  assert.equal(r[1].reason.message, "x");
  assert.deepEqual(r[2], { status: "fulfilled", value: "ok" });
});

await test("race: first to settle wins, even a rejection", async () => {
  assert.equal(await myRace([delay(30, "slow"), delay(5, "quick")]), "quick");
  await assert.rejects(myRace([delay(30, "slow"), delay(5, new Error("quick fail"), true)]), /quick fail/);
});
await test("race: a plain value wins at once", async () => assert.equal(await myRace([delay(20, "later"), "now"]), "now"));
await test("race: empty input never settles", async () => {
  let settled = false;
  myRace([]).then(() => (settled = true), () => (settled = true));
  await delay(30);
  assert.equal(settled, false);
});

await test("any: first fulfilment wins, rejections are ignored", async () => {
  const r = await myAny([delay(5, new Error("no"), true), delay(20, "yes"), delay(40, "later")]);
  assert.equal(r, "yes");
});
await test("any: all rejected gives an AggregateError with every reason in order", async () => {
  await assert.rejects(myAny([delay(20, "a", true), delay(5, "b", true)]), (e) => {
    assert.ok(e instanceof AggregateError);
    assert.deepEqual(e.errors, ["a", "b"]);
    return true;
  });
});
await test("any: empty input rejects", async () => {
  await assert.rejects(myAny([]), AggregateError);
});

await test("matches the built-in on a mixed input", async () => {
  const make = () => [1, delay(10, 2), Promise.reject(new Error("r"))];
  const a = await myAllSettled(make()), b = await Promise.allSettled(make());
  assert.deepEqual(a.map((x) => x.status), b.map((x) => x.status));
});
```

## Which one when?

| Need | Use |
|---|---|
| all must succeed (parallel requests for one page) | `all` |
| I want every outcome, even failures (batch jobs) | `allSettled` |
| first answer wins, or a **timeout** | `race` |
| first **success** wins (mirror servers) | `any` |

:::qa What happens to the other promises when `all` rejects? {level=easy}
**Say this:** "Nothing. They keep running; their results are just ignored. Promises cannot be cancelled. To stop the work, use an `AbortController`."

**In simple words:** `all` stops waiting, not working.
:::

:::qa Why does `results[i] = value` matter more than `results.push(value)`? {level=medium}
**Say this:** "Promises finish in any order. `push` would give finishing order; the contract says the result array matches the input order, so we write by index."

**In simple words:** Put each answer in its own seat.
:::

:::qa Why wrap items with `Promise.resolve`? {level=medium}
**Say this:** "Inputs can be plain values, native promises, or thenables from other libraries. `Promise.resolve` makes them all behave like a real promise and adopts the thenable's state, with correct timing."

**In simple words:** It turns anything into a promise.
:::

:::keypoints
- Wrap with **`Promise.resolve`**; track a **counter**; write results **by index**.
- `all` fails fast; `allSettled` never fails; `race` = first settle; `any` = first success + **AggregateError**.
- **Empty input**: `all`/`allSettled` resolve `[]`, `any` rejects, `race` never settles.
- No combinator **cancels** the losers.
:::
