---
title: Writing your own streams: Readable, Writable, Transform
level: advanced
time: 35
summary: How to implement custom streams (constructor options and simplified API), a line splitter, a CSV-to-objects Transform in object mode, a rate limiter, gzip and hashing in a pipeline, and the common mistakes.
---

## The simplified constructor API

You do not have to subclass. Pass the methods as options:

| Type | Method to implement | What it does |
|---|---|---|
| `Readable` | `read(size)` | call `this.push(chunk)` to produce data, `this.push(null)` to end |
| `Writable` | `write(chunk, encoding, callback)` | handle the chunk, then call `callback(err?)` |
| `Transform` | `transform(chunk, encoding, callback)` | call `this.push(out)` or `callback(null, out)`; optional `flush(callback)` at the end |
| `Duplex` | both `read` and `write` | two independent sides |

## A custom Readable: a counter

```js run node title="A Readable that produces numbers on demand"
const { Readable } = require("node:stream");

class Counter extends Readable {
  constructor(max) { super({ objectMode: true }); this.n = 0; this.max = max; }
  _read() {                                               // called when the consumer wants more
    this.n++;
    if (this.n > this.max) this.push(null);               // null = end of stream
    else this.push({ n: this.n, square: this.n ** 2 });
  }
}

(async () => {
  const rows = [];
  for await (const row of new Counter(5)) rows.push(`${row.n}:${row.square}`);
  console.log(rows.join("  "));
})();
```

`_read` is called **only when the consumer is ready** (backpressure), so a lazy source such as a database cursor or an API paginator fits naturally.

## A custom Writable: collect or send

```js run node title="A Writable that batches items"
const { Writable, Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

class BatchWriter extends Writable {
  constructor(size) { super({ objectMode: true }); this.size = size; this.batch = []; this.sent = []; }
  _write(item, enc, callback) {
    this.batch.push(item);
    if (this.batch.length >= this.size) { this.sent.push([...this.batch]); this.batch.length = 0; }    // e.g. one DB insert
    callback();
  }
  _final(callback) {                                       // called when end() is called: flush what is left
    if (this.batch.length) this.sent.push([...this.batch]);
    callback();
  }
}

(async () => {
  const writer = new BatchWriter(3);
  await pipeline(Readable.from([1, 2, 3, 4, 5, 6, 7]), writer);
  console.log(writer.sent);
})();
```

## A Transform: upper-case, then something real

```js run node title="Transform: modify data as it passes"
const { Transform, Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const upperCase = new Transform({
  transform(chunk, encoding, callback) {
    callback(null, chunk.toString().toUpperCase());       // callback(error, outputChunk)
  },
});

(async () => {
  const parts = [];
  await pipeline(Readable.from(["hello ", "streams"]), upperCase, async function* (src) { for await (const c of src) parts.push(c.toString()); });
  console.log(parts.join(""));
})();
```

## A line splitter (chunks do not respect line boundaries)

Chunks are split at arbitrary byte positions, not at newlines. A parser must **buffer the incomplete last line**.

```js run node title="LineSplitter: keep the unfinished line for the next chunk"
const { Transform, Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

class LineSplitter extends Transform {
  constructor() { super({ readableObjectMode: true }); this.rest = ""; }
  _transform(chunk, enc, cb) {
    const text = this.rest + chunk.toString();
    const lines = text.split("\n");
    this.rest = lines.pop();                               // the last piece might be an incomplete line
    for (const line of lines) this.push(line);
    cb();
  }
  _flush(cb) { if (this.rest) this.push(this.rest); cb(); }   // end of input: emit the leftover
}

(async () => {
  const result = [];
  const chunks = ["ali", "ce,30\nbo", "b,25\nca", "rol,41"];                // lines are cut in the middle
  await pipeline(
    Readable.from(chunks),
    new LineSplitter(),
    async function* (src) { for await (const line of src) result.push(line); },
  );
  console.log(result);
})();
```

## Object mode: parse CSV into objects

`readableObjectMode` and `writableObjectMode` let each side work with **JS values** instead of bytes. A parser reads **bytes** (writable side) and emits **objects** (readable side).

```js run node title="A CSV parser Transform (bytes in, objects out) and a JSON-lines writer"
const { Transform, Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const lines = () => {                                       // reuse of the line splitter as a function
  let rest = "";
  return new Transform({
    readableObjectMode: true,
    transform(chunk, enc, cb) { const parts = (rest + chunk).split("\n"); rest = parts.pop(); parts.forEach((l) => this.push(l)); cb(); },
    flush(cb) { if (rest) this.push(rest); cb(); },
  });
};

const csvToObjects = () => {
  let header = null;
  return new Transform({
    objectMode: true,
    transform(line, enc, cb) {
      const cells = line.split(",");
      if (!header) { header = cells; return cb(); }                                   // the first line is the header
      cb(null, Object.fromEntries(header.map((h, i) => [h, isNaN(cells[i]) ? cells[i] : Number(cells[i])])));
    },
  });
};

const toJsonLines = new Transform({ writableObjectMode: true, transform(obj, enc, cb) { cb(null, JSON.stringify(obj) + "\n"); } });

(async () => {
  const csv = ["name,age,city\nAsha,25,Pu", "ne\nRavi,31,Delhi\n", "Meera,19,Mumbai"];
  let out = "";
  await pipeline(
    Readable.from(csv),
    lines(), csvToObjects(), toJsonLines,
    async function* (src) { for await (const chunk of src) out += chunk; },
  );
  console.log(out.trim().split("\n"));
})();
```

This is exactly what libraries like `csv-parse` or `split2` + `JSON.parse` do. You can filter, map, validate and batch **millions of rows** with constant memory.

## A throttle Transform (rate limiting a stream)

```js run node title="Limit throughput: at most one chunk per interval"
const { Transform, Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const rateLimit = (ms) => new Transform({
  transform(chunk, enc, cb) { setTimeout(() => cb(null, chunk), ms); },             // delaying the callback creates backpressure upstream
});

(async () => {
  const stamps = [];
  await pipeline(
    Readable.from(["a", "b", "c", "d"]),
    rateLimit(30),
    async function* (src) { for await (const item of src) stamps.push(Date.now()); },
  );
  const gaps = stamps.slice(1).map((t, i) => t - stamps[i]);
  console.log("items were spaced out by about 30 ms:", gaps.every((g) => g >= 25));
})();
```

## Built-in transforms: zlib, crypto, and hashing a file while compressing it

```js run node title="Compress and hash in one pass, constant memory"
const { pipeline } = require("node:stream/promises");
const { Readable, Writable } = require("node:stream");
const zlib = require("node:zlib");
const crypto = require("node:crypto");

(async () => {
  const text = "streaming is lovely\n".repeat(5000);
  const hash = crypto.createHash("sha256");

  let compressedSize = 0;
  await pipeline(
    Readable.from([Buffer.from(text)]),
    async function* (src) { for await (const chunk of src) { hash.update(chunk); yield chunk; } },     // a pass-through that hashes
    zlib.createGzip(),
    new Writable({ write(chunk, enc, cb) { compressedSize += chunk.length; cb(); } }),
  );

  console.log("original:", text.length, "bytes | compressed:", compressedSize, "bytes | sha256:", hash.digest("hex").slice(0, 12) + "...");
  console.log("gunzip round trip ok:", zlib.gunzipSync(zlib.gzipSync(text)).toString() === text);
})();
```

## Common mistakes

| Mistake | Why it hurts | Fix |
|---|---|---|
| Not calling `callback()` in `_write` / `_transform` | The stream **stalls forever** | Always call it, exactly once, even on errors |
| Calling `callback` twice | `ERR_MULTIPLE_CALLBACK` | Once only |
| Throwing inside `_transform` | Uncaught exception | Pass the error to `callback(err)` |
| Splitting text per chunk without buffering | Broken lines / characters | Keep leftovers (`rest`) and `flush` |
| Forgetting `objectMode` | `TypeError: ... must be of type string or Buffer` | Set `objectMode` / `readableObjectMode` |
| Using `pipe()` without error handlers | Leaks, crashes | `pipeline()` |
| Pushing in `_read` with no regard for `push()`'s return value | Memory growth | If `push()` returns false, stop until `_read` is called again |
| Doing sync, heavy CPU work in `_transform` | Blocks the event loop | Use worker threads, or chunk the work |

:::interview How do you write a custom Transform stream? What about parsing lines or CSV from chunks?
"I create a `Transform` with a `transform(chunk, encoding, callback)` function that calls `callback(null, output)` for each chunk, and an optional `flush(callback)` that runs at the end of the input. For text parsing I cannot assume chunk boundaries match line boundaries, so I keep the unfinished last line in a buffer and prepend it to the next chunk, emitting leftovers in `flush`. For CSV, bytes come in on the writable side and objects go out, so I use `readableObjectMode: true`. I connect everything with `stream.pipeline` so backpressure, errors and cleanup are handled. Typical mistakes are forgetting to call the callback, which stalls the stream, and forgetting object mode."
:::

## More interview questions on this topic

:::qa What happens if you forget to call the callback in `_transform`? {level=easy}
**Say this:** "The stream waits forever for that chunk to finish, so it stalls: no more chunks are processed and `end` is never reached."

**In simple words:** The conveyor belt waits for a "done" signal that never comes.
:::

:::qa What is the difference between `objectMode` and `readableObjectMode`/`writableObjectMode`? {level=hard}
**Say this:** "`objectMode` makes both sides work with arbitrary JS values. The split options let one side use bytes and the other objects, which is what a parser or serialiser Transform needs."

**In simple words:** Bytes in and objects out, or the reverse, need different modes per side.
:::

:::qa Why does a line parser keep a `rest` variable? {level=medium}
**Say this:** "Chunks are cut at arbitrary byte positions, so the last line in a chunk can be incomplete. It is held back and joined with the start of the next chunk."

**In simple words:** The last half-line waits for its other half.
:::

:::qa What is `_flush` used for? {level=medium}
**Say this:** "It is called after all input has been processed, so a Transform can emit any remaining buffered data, such as the last incomplete line or a final checksum."

**In simple words:** The "closing time" hook.
:::

```quiz
? What must a Transform's transform() function always do?
- Return a value
+ Call its callback once
- Emit end
> Otherwise the stream stalls.
? Which hook emits leftover buffered data at the end of input?
- _write
+ _flush
- _destroy
> Used by parsers.
? Which option lets a Transform read bytes and output JS objects?
- objectMode only
+ readableObjectMode: true
- highWaterMark
> The readable side emits objects.
```

:::keypoints
- Implement via options or subclass: **Readable** `read()` + `push(chunk|null)`, **Writable** `write(chunk, enc, cb)` (+ `final`), **Transform** `transform(chunk, enc, cb)` (+ `flush`).
- **Always call the callback once.** Pass errors to it, do not throw.
- Parsers must **buffer partial lines/records** across chunks and **flush** leftovers.
- **Object mode** (`readableObjectMode`/`writableObjectMode`) for parsers/serialisers.
- Compose with **`pipeline`**, including **async generators**, zlib, crypto.
:::
