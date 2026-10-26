---
title: Sequential vs parallel async work
level: intermediate
time: 25
summary: The performance difference between awaiting one after another and starting jobs together, how to do each correctly in loops (for...of, map + Promise.all, reduce), when order matters, and how to batch.
---

## The two shapes

```viz algo=timeline title="Three 100 ms requests: sequential vs parallel"
scale: 0-320 ms
lane Sequential | 0-100 | A | run
lane Sequential | 100-200 | B | run
lane Sequential | 200-300 | C | run
lane Parallel | 0-100 | A | ok
lane Parallel | 0-100 | B | ok
lane Parallel | 0-100 | C | ok
mark 300 | sequential done
mark 100 | parallel done
```

- **Sequential:** each step waits for the previous one. Total = **sum** of times (300 ms).
- **Parallel:** all steps start together. Total = the **longest** time (100 ms).

A senior developer should always ask: **do these steps depend on each other?**

## The most common beginner slowdown

```js run title="Independent calls awaited one after another"
const api = (name, ms) => new Promise((r) => setTimeout(() => r(name + " data"), ms));

async function slow() {
  const t = Date.now();
  const user = await api("user", 100);
  const orders = await api("orders", 100);       // does NOT need `user`, but waits for it
  const stats = await api("stats", 100);
  return { ms: Date.now() - t, parts: [user, orders, stats] };
}

async function fast() {
  const t = Date.now();
  const [user, orders, stats] = await Promise.all([api("user", 100), api("orders", 100), api("stats", 100)]);
  return { ms: Date.now() - t, parts: [user, orders, stats] };
}

(async () => {
  const s = await slow();
  const f = await fast();
  console.log("slow is about 300 ms:", s.ms >= 290);
  console.log("fast is about 100 ms:", f.ms < 190);
})();
```

A trick that also works: **start** the promises first, **await** them later.

```js run title="Start now, await later"
const api = (name, ms) => new Promise((r) => setTimeout(() => r(name), ms));

(async () => {
  const t = Date.now();
  const userPromise = api("user", 80);          // starts immediately
  const ordersPromise = api("orders", 80);      // starts immediately
  // ... other work could happen here ...
  const user = await userPromise;
  const orders = await ordersPromise;
  console.log(user, orders, "total under 160 ms:", Date.now() - t < 150);
})();
```

## When the steps depend on each other: sequential is correct

```js run title="Dependent steps must be sequential"
const getUser = async (id) => ({ id, teamId: 7 });
const getTeam = async (teamId) => ({ teamId, name: "Core" });
const getMembers = async (team) => [`${team.name}-1`, `${team.name}-2`];

(async () => {
  const user = await getUser(1);
  const team = await getTeam(user.teamId);       // needs the user first
  const members = await getMembers(team);        // needs the team first
  console.log(members);
})();
```

## Loops: the three patterns

You have a list of 4 items and an async function to apply to each. What do you want?

### 1. One after another: `for...of` with `await`

Use when **order matters**, when each step depends on the previous one, or to avoid hitting a server too hard.

```js run title="Sequential loop"
const save = (item) => new Promise((r) => setTimeout(() => { console.log("saved", item); r(item); }, 20));

(async () => {
  for (const item of ["a", "b", "c"]) {
    await save(item);                          // waits for each
  }
  console.log("all saved in order");
})();
```

### 2. All at once: `map` + `Promise.all`

Use when the jobs are **independent**.

```js run title="Parallel loop"
const fetchPrice = (id) => new Promise((r) => setTimeout(() => r(id * 100), 50 - id));   // different finish times

(async () => {
  const ids = [1, 2, 3, 4];
  const prices = await Promise.all(ids.map((id) => fetchPrice(id)));    // map returns promises; all awaits them
  console.log(prices);                                                  // order of ids
})();
```

### 3. Not `forEach`!

```js run title="forEach does not wait" 
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  [1, 2, 3].forEach(async (n) => {
    await wait(20);
    console.log("inside forEach", n);
  });
  console.log("forEach finished (but the work has not)");        // prints first
  await wait(60);
})();
```

`forEach` ignores the promises returned by the callback, so nothing waits for them, and errors become unhandled rejections.

## Sequential with `reduce`

When you cannot use `async/await` (or want a quick helper):

```js run title="Sequential promises with reduce"
const task = (n) => () => new Promise((r) => setTimeout(() => { console.log("task", n); r(n); }, 10));

[task(1), task(2), task(3)].reduce(
  (chain, fn) => chain.then(fn),
  Promise.resolve()
).then(() => console.log("all tasks done in order"));
```

## Batching: not everything at once, not one at a time

Starting 10,000 requests at once can overload the server, the network or the browser's connection limit. Use **batches** or a **concurrency limit**.

```js run title="Process in batches of N"
const handle = (id) => new Promise((r) => setTimeout(() => r(id), 10));

async function inBatches(items, size, worker) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    console.log("batch:", batch);
    results.push(...(await Promise.all(batch.map(worker))));      // each batch in parallel, batches in sequence
  }
  return results;
}

inBatches([1, 2, 3, 4, 5, 6, 7], 3, handle).then((r) => console.log("results:", r));
```

A **pool** (a sliding window) is better than batches because it keeps N workers busy all the time. See the [concurrency lesson](#/l/concurrency-control).

## Parallel but handle each result as soon as it arrives

```js run title="Handle in completion order"
const job = (name, ms) => new Promise((r) => setTimeout(() => r(name), ms));

(async () => {
  const promises = [job("slow", 60), job("fast", 10), job("medium", 30)];
  // process each one when it finishes, not in input order
  await Promise.all(promises.map((p) => p.then((name) => console.log("finished:", name))));
})();
```

:::interview What is the difference between awaiting in a loop and using Promise.all? When would you pick each?
"Awaiting inside a loop runs the jobs one after another, so total time is the sum. `Promise.all(items.map(fn))` starts them all at once, so total time is roughly the longest one. I use sequential awaits when each step depends on the previous result, when order or side effects matter, or when I must limit the load on a service. I use `Promise.all` for independent work. For many items I use batching or a concurrency pool so I do not start thousands of requests at once. And I never use `forEach` with `async` callbacks, because it does not wait."
:::

## More interview questions on this topic

:::qa Why is `await` inside a `for` loop sometimes a performance problem? {level=easy}
**Say this:** "Each iteration waits for the previous one, so independent requests run one at a time. Use `Promise.all` with `map` if they do not depend on each other."

**In simple words:** You queue for each item instead of sending everyone at once.
:::

:::qa How do you run async tasks in parallel but keep the result order? {level=easy}
**Say this:** "`await Promise.all(items.map(asyncFn))`. The results array follows the input order."

**In simple words:** They finish in any order, but are put back in their seats.
:::

:::qa How would you process 1000 URLs without sending 1000 requests at once? {level=medium}
**Say this:** "Use a concurrency limit, a pool of N workers that pull from a queue, or process in batches of N. A library like `p-limit` or my own small pool."

**In simple words:** Keep, say, 5 requests running at all times.
:::

:::qa What is wrong with `items.forEach(async (i) => await save(i))`? {level=easy}
**Say this:** "`forEach` does not wait for the returned promises, so code after it runs before the saves finish, and failures are unhandled. Use `for...of` or `Promise.all(map(...))`."

**In simple words:** forEach fires and forgets.
:::

```quiz
? Three independent 100 ms calls awaited one after another take about…
- 100 ms
+ 300 ms
- 200 ms
> The times add up.
? What is the best way to run independent async calls together?
- for...of with await
+ await Promise.all(items.map(fn))
- items.forEach(async fn)
> Start all, wait for all.
? When is a sequential loop the right choice?
- Never
+ When each step depends on the previous result, or order or load matters
- Only in Node
> Dependencies and rate limits.
```

:::keypoints
- **Sequential** total = sum of times. **Parallel** total ≈ the longest. Ask: *do the jobs depend on each other?*
- Independent: `await Promise.all(items.map(fn))` (or start promises first, await later).
- Dependent or order-sensitive: `for...of` with `await`.
- Never `forEach(async ...)`. For many items use **batches** or a **concurrency pool**.
:::
