---
title: Async iterators, for await and async generators
level: advanced
time: 30
summary: How to consume data that arrives over time with for await...of, how to write async generators (pagination, polling, streams, event queues), and how this connects to Node streams and fetch bodies.
---

## The idea

A normal `for...of` loop works with **iterables**: objects that give values one by one **right now**. But what if each value **arrives later** (a page from an API, a chunk of a file, a message from a socket)?

`for await...of` loops over an **async iterable**: it waits for each value.

```js run title="for await over an array of promises"
const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

(async () => {
  for await (const value of [wait(30, "A"), wait(10, "B"), "plain C"]) {   // waits for each, in order
    console.log("got", value);
  }
})();
```

## Async generators: `async function*`

An **async generator** is a function you can both `await` in **and** `yield` from. It returns an async iterator.

```js run title="An async generator that produces values over time"
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function* countdown(from) {
  for (let n = from; n > 0; n--) {
    await wait(10);                       // wait for something
    yield n;                              // produce a value
  }
  return "liftoff";
}

(async () => {
  for await (const n of countdown(3)) console.log(n);
  console.log("finished");
})();
```

The consumer **pulls** values at its own pace. The generator does not run ahead: it pauses at each `yield` until the consumer asks for the next (this is called **backpressure** and it is a big benefit).

## A real use: paginated API

Hide pagination inside a generator, so the caller just loops.

```js run title="Iterate through all pages as if it were one list"
const fakeApi = async (page) => {            // pretend each page takes time
  await new Promise((r) => setTimeout(r, 10));
  const data = { 1: ["a", "b", "c"], 2: ["d", "e", "f"], 3: ["g"] }[page] || [];
  return { items: data, nextPage: page < 3 ? page + 1 : null };
};

async function* allItems() {
  let page = 1;
  while (page) {
    const { items, nextPage } = await fakeApi(page);
    yield* items;                             // yield each item of this page
    page = nextPage;
  }
}

(async () => {
  const seen = [];
  for await (const item of allItems()) {
    seen.push(item);
    if (item === "e") break;                  // stop early: no more pages are fetched
  }
  console.log(seen);
})();
```

If the caller `break`s out of the loop, the generator's `return()` is called, and its `finally` blocks run: you can **clean up** (close connections, files).

```js run title="Cleanup with finally when the consumer stops early"
async function* resource() {
  console.log("open connection");
  try {
    yield 1; yield 2; yield 3;
  } finally {
    console.log("close connection (even if the consumer broke out)");
  }
}

(async () => {
  for await (const x of resource()) {
    console.log("got", x);
    if (x === 2) break;
  }
})();
```

## The protocol (what `for await` calls)

An object is **async iterable** if it has `[Symbol.asyncIterator]()` that returns an object with `next()` returning a **promise** of `{ value, done }`.

```js run title="A hand-made async iterable"
const ticker = {
  from: 1, to: 3,
  [Symbol.asyncIterator]() {
    let current = this.from;
    const last = this.to;
    return {
      next: async () => {
        await new Promise((r) => setTimeout(r, 5));
        return current <= last ? { value: current++, done: false } : { value: undefined, done: true };
      },
      return: async () => { console.log("iterator closed early"); return { done: true }; },
    };
  },
};

(async () => {
  for await (const t of ticker) console.log("tick", t);
})();
```

## Turning events into an async iterator

A common need: use `for await` over **events** (messages, clicks, file changes). The trick: an internal **queue** of pending values and pending consumers.

```js run title="A small channel: push values in, for await them out"
class Channel {
  #values = []; #waiters = []; #closed = false;
  push(value) {
    const waiter = this.#waiters.shift();
    if (waiter) waiter({ value, done: false });
    else this.#values.push(value);
  }
  close() {
    this.#closed = true;
    this.#waiters.splice(0).forEach((w) => w({ value: undefined, done: true }));
  }
  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this.#values.length) return Promise.resolve({ value: this.#values.shift(), done: false });
        if (this.#closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.#waiters.push(resolve));       // wait for the next push
      },
    };
  }
}

const channel = new Channel();
setTimeout(() => channel.push("message 1"), 10);
setTimeout(() => channel.push("message 2"), 20);
setTimeout(() => channel.close(), 30);

(async () => {
  for await (const msg of channel) console.log("received:", msg);
  console.log("channel closed");
})();
```

In Node, `events.on(emitter, "event")` and `readline` already return async iterables.

## Node streams are async iterable

```js run node title="Read a stream with for await"
const { Readable } = require("node:stream");

(async () => {
  const stream = Readable.from(["chunk 1\n", "chunk 2\n", "chunk 3\n"]);
  for await (const chunk of stream) process.stdout.write("read: " + chunk);
})();
```

This is the simplest way to consume a Node readable stream: it handles backpressure and cleanup for you. `fetch` response bodies (`response.body`) are also async iterable in modern runtimes.

## Combining: `Promise.all` vs `for await`

| | `for await` over many promises | `Promise.all` |
|---|---|---|
| When you see results | One at a time, **in order** | All together, at the end |
| Failure | Stops at the first failing item you reach | Rejects as soon as any fails |
| Memory | Processes items as they come | Holds all results |

:::interview What are async generators and for await...of? When would you use them?
"An async generator, `async function*`, can both `await` and `yield`, and returns an async iterator. `for await...of` consumes it, waiting for each value, and values are pulled on demand, which gives natural backpressure. I use them to hide pagination, to process large data lazily, to turn event sources into streams, and to read Node streams. When the consumer breaks out of the loop, the generator's `finally` runs, so I can clean up resources. The protocol behind it is `Symbol.asyncIterator` with a `next()` that returns a promise of `{ value, done }`."
:::

## More interview questions on this topic

:::qa What is the difference between `for...of` and `for await...of`? {level=easy}
**Say this:** "`for...of` uses the sync iterator protocol, where each value is ready now. `for await...of` uses the async protocol: it awaits each `next()` call, so values can arrive over time."

**In simple words:** One waits for each item, the other does not.
:::

:::qa How does an async generator give backpressure? {level=medium}
**Say this:** "It only runs until the next `yield` when the consumer asks for a value. If the consumer is slow, the generator stays paused, so data is not produced faster than it is consumed."

**In simple words:** The producer waits for the consumer.
:::

:::qa What happens to an async generator if the consumer breaks out of the loop early? {level=hard}
**Say this:** "`for await` calls the iterator's `return()`, which resumes the generator at the `yield` as if with a return statement, so any `finally` blocks run and resources are released."

**In simple words:** `break` is a polite "please clean up and stop".
:::

:::qa How would you read a very large file line by line in Node? {level=medium}
**Say this:** "Use `readline.createInterface({ input: fs.createReadStream(path) })` and iterate with `for await (const line of rl)`, which streams without loading the whole file."

**In simple words:** Stream it, and loop with `for await`.
:::

```quiz
? Which syntax defines an async generator?
- function async* f() {}
+ async function* f() {}
- async* function f() {}
> async function*.
? What does `for await` do with each value?
- Reads it without waiting
+ Awaits it (or the promise of the next value)
- Skips promises
> It is meant for values that arrive later.
? What runs when a consumer breaks out of a for await loop over an async generator?
- Nothing
+ The generator's finally blocks, through return()
- An error is thrown
> The generator is closed properly.
```

:::keypoints
- **`for await...of`** loops over async iterables (`Symbol.asyncIterator`, `next()` returns a promise).
- **`async function*`** = `await` + `yield`: great for pagination, streaming and polling.
- Values are **pulled** (backpressure). `break` triggers `return()` and `finally` cleanup.
- Node streams, `readline`, `events.on` and fetch bodies are async iterable.
- Build a **channel** (queue + waiters) to turn events into an async iterator.
:::
