---
title: Async Code, Promises & Streams
level: intermediate
time: 40
summary: The async toolkit every AI app needs — Promise<T>, async/await, running calls in parallel with Promise.all, timeouts and cancellation with AbortSignal, retries with backoff, concurrency limits, and async generators for streaming tokens.
---

Calling a model, an embedding API or a vector database takes time — from milliseconds to minutes. JavaScript doesn't stop and wait; it continues and comes back when the result is ready. **Promises** and **async/await** make that readable, and TypeScript tracks what each promise will eventually give you.

:::def Promise
An object representing a value that will be available **later** (or an error). `Promise<string>` means "eventually a string". You get the value with `await` (inside an `async` function or at the top level of a module).
:::

## async / await

```ts run level=intermediate
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function embed(text: string): Promise<number[]> {
  await sleep(100);                                   // pretend: network call to an embedding API
  return [text.length / 100, (text.match(/e/g)?.length ?? 0) / 10];
}

const vector = await embed("refund policy");
//    ^?
console.log(vector);

const pending = embed("pricing");                     // without await you get the Promise itself
//    ^?
console.log(pending instanceof Promise, await pending);
```

:::warn Forgetting await
`const v = embed("x")` gives you a `Promise<number[]>`, not a `number[]`. TypeScript will complain as soon as you use it like an array — a very common and very useful error.
:::

## Parallel work: Promise.all, allSettled, race

```ts run level=intermediate
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function embed(text: string) { await sleep(100); return text.length; }
async function countTokens(text: string) { await sleep(150); return Math.ceil(text.length / 4); }

console.time("sequential");
for (const t of ["a refund", "the pricing", "shipping"]) await embed(t);
console.timeEnd("sequential");

console.time("parallel");
const lengths = await Promise.all(["a refund", "the pricing", "shipping"].map(embed));
console.timeEnd("parallel");
console.log(lengths);

// Different types in one Promise.all — the result is a typed tuple
const [len, tokens] = await Promise.all([embed("hello"), countTokens("hello world")]);
//     ^?
console.log(len, tokens);
```

```ts run level=intermediate
async function callModel(name: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 50));
  if (name === "flaky") throw new Error("overloaded (529)");
  return `answer from ${name}`;
}

// allSettled never throws: each result says whether it worked
const results = await Promise.allSettled(["opus", "flaky", "haiku"].map(callModel));
for (const r of results) {
  if (r.status === "fulfilled") console.log("✅", r.value);
  else console.log("❌", (r.reason as Error).message);
}
```

| Function | Resolves when | Rejects when | Use for |
|---|---|---|---|
| `Promise.all` | **all** succeed | **any** fails | independent calls that must all work |
| `Promise.allSettled` | all finish | never | batch jobs where some may fail |
| `Promise.race` | the **first** finishes | the first fails | timeouts, fastest-wins |
| `Promise.any` | the **first success** | all fail | fallback across providers |

## Timeouts and cancellation with AbortSignal

:::def AbortSignal
A standard object that tells long-running work "please stop". `fetch`, the Claude SDK and most modern APIs accept a `signal`. `AbortSignal.timeout(ms)` creates one that fires automatically.
:::

```ts run level=intermediate
function slowModel(prompt: string, { signal }: { signal?: AbortSignal } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(`answer to "${prompt}"`), 500);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);                  // reason is a DOMException (TimeoutError/AbortError)
    });
  });
}

console.log(await slowModel("fast enough", { signal: AbortSignal.timeout(1000) }));

try {
  await slowModel("too slow", { signal: AbortSignal.timeout(200) });
} catch (e) {
  console.log("stopped:", e instanceof DOMException ? e.name : e);
}

const controller = new AbortController();           // manual cancel, e.g. a "Stop" button
setTimeout(() => controller.abort(), 100);
try { await slowModel("user pressed stop", { signal: controller.signal }); }
catch (e) { console.log("stopped:", (e as DOMException).name); }
```

## A generic retry helper

```ts run level=intermediate
async function withRetry<T>(fn: () => Promise<T>, { retries = 3, baseMs = 100 } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries) throw err;
      const wait = baseMs * 2 ** attempt;              // 100, 200, 400… (exponential backoff)
      console.log(`attempt ${attempt + 1} failed: ${(err as Error).message} — waiting ${wait} ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

let calls = 0;
const answer = await withRetry(async () => {
  calls++;
  if (calls < 3) throw new Error("rate limited (429)");
  return { text: "Hello!", tokens: 3 };
});
console.log(answer);                // typed as { text: string; tokens: number }
```

## Limiting concurrency

Embedding 10,000 chunks with `Promise.all` would fire 10,000 requests at once and hit rate limits. Process them a few at a time:

```ts run level=advanced
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0, active = 0, peak = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      active++; peak = Math.max(peak, active);
      results[i] = await fn(items[i], i);
      active--;
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  console.log(`peak concurrency: ${peak}`);
  return results;
}

const chunks = Array.from({ length: 12 }, (_, i) => `chunk ${i}`);
console.time("12 chunks, 4 at a time");
const vectors = await mapLimit(chunks, 4, async (c) => {
  await new Promise((r) => setTimeout(r, 50));
  return [c.length, Number(c.split(" ")[1])];
});
console.timeEnd("12 chunks, 4 at a time");
console.log(vectors.slice(0, 3), "…");
```

## Async generators: streaming

:::def Async generator
A function declared `async function*` that `yield`s values over time. The caller reads them with `for await (const x of gen())`. Its type is `AsyncGenerator<T>` (or `AsyncIterable<T>`). This is exactly how SDKs expose streamed tokens.
:::

```ts run level=intermediate
async function* streamTokens(text: string, delayMs = 40): AsyncGenerator<string> {
  for (const word of text.split(" ")) {
    await new Promise((r) => setTimeout(r, delayMs));
    yield word + " ";
  }
}

let full = "";
for await (const token of streamTokens("Streaming shows progress immediately instead of waiting")) {
  full += token;
  console.log(full);
}

// Generators compose: transform a stream into another stream
async function* upperCase(src: AsyncIterable<string>) {
  for await (const t of src) yield t.toUpperCase();
}
const shout: string[] = [];
for await (const t of upperCase(streamTokens("stream transforms are easy", 10))) shout.push(t);
console.log(shout.join(""));
```

:::ai
The Claude SDK's streaming API is an **async iterable** of typed events: `for await (const event of client.messages.stream(...))`. Combine it with an `AbortSignal` for a Stop button, `withRetry` for transient errors (429/529), and `mapLimit` for embedding large document sets politely. Module 5 puts these together.
:::

## Check yourself

```quiz
? What is the type of `embed("x")` (without await) if embed returns Promise<number[]>?
+ Promise<number[]>
- number[]
- any
> You need await to get the value.

? Which helper waits for all calls and never throws, reporting each success or failure?
+ Promise.allSettled
- Promise.all
- Promise.race
> allSettled returns { status, value | reason } for each promise.

? How do you consume an AsyncGenerator<string> of tokens?
+ for await (const token of gen) { ... }
- gen.forEach(...)
- await gen.all()
> Async iterables are read with for await.
```

:::keypoints
- `async` functions return `Promise<T>`; `await` gives you `T`. Forgetting `await` is caught by types.
- `Promise.all` (typed tuples!), `allSettled`, `race`, `any` for parallel work.
- `AbortSignal` (incl. `AbortSignal.timeout`) for timeouts and Stop buttons.
- Generic helpers like `withRetry<T>` and `mapLimit<T, R>` keep result types intact.
- `async function*` + `for await` model streams — the same shape as SDK streaming APIs.
:::
