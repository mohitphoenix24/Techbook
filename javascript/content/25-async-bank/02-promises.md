---
title: "Async bank: promises"
level: medium
time: 30
summary: Fourteen answers on promise states, chaining, error handling, the combinators, unhandled rejections, the constructor anti-pattern, sequential versus parallel work and thenables.
---

:::qa What is a promise, and what are its states? {level=easy}
**Say this:** "An object that represents a value that will be available later. It is pending, then either fulfilled with a value or rejected with a reason, and it settles only once. Handlers added with `then` run asynchronously, even if the promise is already settled."

**In simple words:** A token you get at the counter. Later it turns into your food, or into an apology.
:::

:::qa Why did promises replace callbacks? {level=easy}
**Say this:** "Callbacks nest into 'callback hell', each level needs its own error handling, and control passes to code you do not own (called twice, called never, called too early). Promises give flat chains, one place for errors, guaranteed single settlement, and they compose with `all` and `race`."

**In simple words:** A standard receipt for async results instead of everybody inventing their own.
:::

:::qa What does `then` return? {level=medium}
**Say this:** "A new promise. If the handler returns a value, the next promise fulfils with it. If it returns a promise, the next one follows that promise. If it throws, the next one rejects. If the handler is missing, the result passes through."

**In simple words:** Each `then` adds a link to the chain, and the link decides what to pass on.
:::

:::qa How do you handle errors in a promise chain? {level=easy}
**Say this:** "A rejection or a thrown error skips the `then` handlers until the next `.catch` (or the second argument of `then`). Put one `.catch` at the end for a chain, and `.finally` for cleanup. `catch` returns a promise too, so the chain can continue after recovery."

**In simple words:** Errors slide down the chain until someone catches them.
:::

:::qa What is the difference between `.then(a, b)` and `.then(a).catch(b)`? {level=medium}
**Say this:** "In `.then(a, b)`, `b` handles errors from earlier in the chain only, not errors thrown inside `a`. In `.then(a).catch(b)`, `b` also catches errors thrown by `a`. The second form is usually what you want."

**In simple words:** The second form has a net under the first handler as well.
:::

:::qa Explain `Promise.all`, `allSettled`, `race` and `any`. {level=medium}
**Say this:** "`all` fulfils with all results in order, and rejects at the first rejection. `allSettled` waits for everything and reports each outcome, never rejecting. `race` settles with the first settled promise, either way. `any` fulfils with the first fulfilment and rejects with an `AggregateError` only if all reject."

**In simple words:** All must succeed; report everyone; first to finish; first to succeed.
:::

:::qa When would you use `Promise.race`? {level=medium}
**Say this:** "For a timeout (`race([fetch(), timeout(5000)])`) or for taking the fastest of several sources. The losing promises keep running, so also cancel them with an `AbortController` when you can."

**In simple words:** First one across the line wins, but the others keep running unless you stop them.
:::

:::qa What is an unhandled rejection? {level=medium}
**Say this:** "A rejected promise with no handler by the end of the microtask turn. Browsers fire `unhandledrejection`; modern Node terminates the process with an error by default. Always handle rejections, and add a global listener only for logging."

**In simple words:** An error that nobody caught, and now it can crash the app.
:::

:::qa What is the "explicit promise construction anti-pattern"? {level=medium}
**Say this:** "Wrapping something that already returns a promise in `new Promise((resolve, reject) => fetch().then(resolve, reject))`. It is long, easy to get wrong (lost errors), and unnecessary. Just return the promise. Use `new Promise` only to wrap callback or event APIs."

**In simple words:** Do not put a gift in a box just to wrap it again.
:::

:::qa How do you run promises sequentially and in parallel? {level=easy}
**Say this:** "Parallel: start them all, then `await Promise.all(promises)`. Sequential: `for (const x of items) await work(x)` or a `reduce` chain. Use a concurrency limit (a pool) when there are many, to avoid overloading a server."

**In simple words:** Parallel is 'everybody start now'; sequential is 'one after another'.
:::

:::qa What is a thenable? {level=hard}
**Say this:** "Any object with a `then` method. `await` and `Promise.resolve` accept thenables and follow them, which is how different promise libraries interoperate."

**In simple words:** If it quacks like a promise, the language treats it as one.
:::

:::qa Are promise executors synchronous? {level=medium}
**Say this:** "Yes. The function passed to `new Promise` runs immediately and synchronously. Only the `then`/`catch`/`finally` handlers are asynchronous (microtasks)."

**In simple words:** Starting the job is instant; reacting to the result is later.
:::

:::qa Can you cancel a promise? {level=medium}
**Say this:** "No, a promise only holds a result. You cancel the work behind it, using `AbortController`/`AbortSignal` passed into `fetch` or your own code, and ignore or reject the result."

**In simple words:** You cannot recall a letter, but you can tell the sender to stop.
:::

:::qa What are `Promise.withResolvers` and `Promise.try`? {level=hard}
**Say this:** "`Promise.withResolvers()` returns `{ promise, resolve, reject }`, replacing the pattern of leaking resolve and reject out of an executor. `Promise.try(fn)` runs `fn` and returns a promise for its result or its synchronous error. Both are newer, so check runtime support."

**In simple words:** Cleaner ways to make a promise you settle from outside, or to start a mixed sync/async function safely.
:::

:::keypoints
- States: **pending → fulfilled / rejected**, once; handlers are **async**.
- `then` returns a **new** promise; errors skip to the next **`catch`**.
- `all` (fail fast), `allSettled` (all outcomes), `race` (first settle), `any` (first success).
- Handle every rejection; do not wrap promises in `new Promise`; **cancel work**, not promises.
:::
