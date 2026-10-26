---
title: "Async bank: async/await and patterns"
level: medium
time: 25
summary: Twelve answers on what async and await really do, errors, await in loops, parallel work, async iteration, return await, race conditions and common mistakes.
---

:::qa What does an `async` function return? {level=easy}
**Say this:** "Always a promise. A returned value becomes a fulfilled promise; a thrown error becomes a rejected promise. `await` pauses the function until a promise settles, without blocking the thread."

**In simple words:** `async` wraps the result in a promise; `await` waits for one.
:::

:::qa What does `await` do under the hood? {level=medium}
**Say this:** "It is like `.then`: the function is suspended, the rest of the function becomes a microtask that runs when the awaited promise settles, and control returns to the caller. Awaiting a non-promise value still takes one microtask turn."

**In simple words:** Put a bookmark in the book, go away, and come back when the answer is ready.
:::

:::qa How do you handle errors with async/await? {level=easy}
**Say this:** "`try`/`catch` around the `await`s, or `.catch()` on the returned promise. A rejected awaited promise throws at that line. Each async function that is not awaited needs its own handling, or the rejection is unhandled."

**In simple words:** An `await` on a failed promise acts like a normal thrown error.
:::

:::qa Why does `array.forEach(async (x) => { await work(x); })` not wait? {level=medium}
**Say this:** "`forEach` ignores the returned promises, so it finishes immediately and the work continues in the background. Use `for...of` with `await` for sequential work, or `await Promise.all(array.map(async (x) => ...))` for parallel work."

**In simple words:** `forEach` does not wait for anyone to come back.
:::

:::qa Sequential or parallel: what is wrong with `for (const id of ids) { results.push(await fetchUser(id)); }`? {level=medium}
**Say this:** "Nothing is wrong if the order or rate limit matters. But if the requests are independent, it is slow, because each waits for the previous one. Start them together with `Promise.all(ids.map(fetchUser))`, and limit the concurrency for large lists."

**In simple words:** Ten queues are faster than one queue, if the shop can handle it.
:::

:::qa How do you run two independent awaits in parallel? {level=easy}
**Say this:** "Start both promises first, then await them: `const [a, b] = await Promise.all([getA(), getB()])`. Writing `const a = await getA(); const b = await getB();` runs them one after the other."

**In simple words:** Call both waiters before sitting down to wait.
:::

:::qa What is the difference between `return value`, `return await value` and `return promise` inside `try/catch`? {level=hard}
**Say this:** "Inside a `try`, `return promise` returns before the promise settles, so a rejection is **not** caught by that `catch`. `return await promise` waits inside the `try`, so the `catch` and `finally` see the error. Outside a `try`, plain `return promise` is fine."

**In simple words:** If you want your safety net to catch it, wait inside the net.
:::

:::qa What is `for await...of`? {level=medium}
**Say this:** "It loops over an async iterable, waiting for each item (streams, paginated APIs, async generators). Breaking out calls the iterator's `return()`, so cleanup in the generator's `finally` runs."

**In simple words:** A loop that waits for each next item to arrive.
:::

:::qa Can you use `await` at the top level? {level=easy}
**Say this:** "Yes, in ES modules (`.mjs`, `type: module`, browser `<script type='module'>`). Not in CommonJS scripts, where you wrap code in an async function."

**In simple words:** Only in modules.
:::

:::qa How do you add a timeout to an `await`? {level=medium}
**Say this:** "Race it with a timer: `await Promise.race([work(), timeout(ms)])`, clear the timer afterwards, and pass an `AbortSignal` (for example `AbortSignal.timeout(ms)`) into `fetch` so the real request stops, not only the waiting."

**In simple words:** Stop waiting and also stop the work.
:::

:::qa What are common async/await mistakes? {level=medium}
**Say this:** "Forgetting `await` (a promise is truthy and the bug is silent), `await` in a loop that should be parallel, `forEach` with async callbacks, swallowing errors with an empty `catch`, creating unhandled rejections by not awaiting, and mixing `.then` chains with `await` in confusing ways."

**In simple words:** Most bugs are missing waits, too many waits, or hidden errors.
:::

:::qa How can a race condition happen in single-threaded JavaScript? {level=hard}
**Say this:** "Every `await` lets other code run. Two calls can both read a value, wait, and then write back, so one update is lost; or an old slow response can overwrite a newer one. Fixes: a mutex/queue, atomic operations in the database, cancelling or ignoring stale calls."

**In simple words:** One thread, but conversations still interleave.
:::

:::qa How would you retry a failing request with backoff? {level=medium}
**Say this:** "A loop with `try`/`catch`: on failure wait `delay * 2^attempt` (plus random jitter), retry only for retryable errors (network errors, 5xx, 429) and idempotent requests, stop after a limit and throw the last error. Honour `Retry-After`."

**In simple words:** Try again, but wait longer each time, and give up at some point.
:::

:::keypoints
- `async` → returns a **promise**; `await` → **suspends** the function (microtask).
- Independent work: **start together**, then `Promise.all`; avoid `forEach(async ...)`.
- `return await` inside `try` if you want the `catch` to see rejections.
- Every `await` is a **gap** where other code runs: races are possible.
:::
