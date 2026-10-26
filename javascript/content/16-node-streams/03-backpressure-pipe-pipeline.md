---
title: Backpressure, pipe and pipeline
level: advanced
time: 40
summary: What backpressure is and why it matters, how write() returning false and the drain event work, what pipe does for you, why pipeline is safer (errors and cleanup), and how to see backpressure in a runnable demo.
---

## The problem: a fast producer and a slow consumer

Reading a file from a fast SSD can be 1000 times faster than uploading it over a slow network. If the producer keeps pushing data, and the consumer cannot keep up, the data piles up in **memory** (the internal buffer), until the process runs out of memory.

> "**Backpressure** is the mechanism by which a slow consumer tells a fast producer: **'stop, I am full'**, and later: **'OK, send more'**."

:::analogy A tap and a bucket with a small hole
Water (data) flows from the tap faster than the bucket drains. If you ignore the level, the bucket overflows. A sensible person closes the tap when the bucket is nearly full and opens it again when it has drained.
:::

## How backpressure works in Node streams

For a **Writable**:

1. `writable.write(chunk)` **returns `false`** when the internal buffer is at or above `highWaterMark`. That means: **stop writing now**.
2. When the buffer has drained, the stream emits **`'drain'`**: **you may write again**.

```js run node title="write() returning false, and the drain event"
const { Writable } = require("node:stream");

// a slow writable: each chunk "takes" 10 ms to process
const slow = new Writable({
  highWaterMark: 10,                                        // tiny buffer: 10 bytes
  write(chunk, encoding, callback) { setTimeout(callback, 10); },
});

const chunk = Buffer.alloc(4);                              // 4 bytes
const results = [];
for (let i = 1; i <= 5; i++) {
  const ok = slow.write(chunk);
  results.push(`write ${i}: ok=${ok} buffered=${slow.writableLength}B`);
}
console.log(results.join("\n"));
console.log("needs drain:", slow.writableNeedDrain);

slow.once("drain", () => console.log("drain fired: buffer empty, safe to write again. buffered =", slow.writableLength));
```

After the third write the buffer holds 12 bytes (over 10), so `write` starts returning `false`. If we **ignore** that and keep writing, the buffer grows without limit.

## Respecting backpressure manually

```js run node title="Write a million lines without exploding memory"
const { Writable } = require("node:stream");
const { once } = require("node:events");

let received = 0;
const sink = new Writable({
  highWaterMark: 1024,
  write(chunk, enc, cb) { received += chunk.length; setImmediate(cb); },     // consumes slowly
});

async function produce(total) {
  let maxBuffered = 0, pauses = 0;
  for (let i = 0; i < total; i++) {
    const ok = sink.write(`line ${i}\n`);
    maxBuffered = Math.max(maxBuffered, sink.writableLength);
    if (!ok) { pauses++; await once(sink, "drain"); }                           // WAIT until the consumer catches up
  }
  sink.end();
  await once(sink, "finish");
  return { maxBuffered, pauses };
}

produce(20000).then(({ maxBuffered, pauses }) => {
  console.log("received bytes:", received);
  console.log("buffer stayed small (about the highWaterMark):", maxBuffered < 2048, "| had to wait:", pauses > 0);
});
```

Without the `await once(sink, "drain")` line, the buffer would hold **all 20,000 lines** at once (and a million, in real life).

## `pipe()`: backpressure handled for you

```js
readable.pipe(writable);
```

`pipe` connects them: it writes each chunk, **pauses** the readable when `write()` returns `false`, and **resumes** it on `'drain'`. That is **automatic backpressure**.

```js run node title="pipe: a fast producer into a slow consumer, safely" 
const { Readable, Writable } = require("node:stream");

let produced = 0, consumed = 0, maxBuffered = 0;
const source = new Readable({
  highWaterMark: 16,
  read() { this.push(produced < 200 ? (produced++, "chunk") : null); },        // an endless-looking fast producer
});
const slowSink = new Writable({
  highWaterMark: 16,
  write(chunk, enc, cb) { consumed++; maxBuffered = Math.max(maxBuffered, this.writableLength); setImmediate(cb); },
});

source.pipe(slowSink).on("finish", () => {
  console.log("consumed everything:", consumed, "| writable buffer never exceeded its mark by much:", maxBuffered <= 32);
});
```

## The problem with `pipe()`: errors and cleanup

`pipe` **does not forward errors** and **does not close** the other streams if one fails:

- If the readable errors, the writable stays open (a **file descriptor leak**).
- If the writable errors, the readable is **not destroyed**.
- You need an `error` handler **on every stream**.

```js run node title="pipe leaves the destination open after a source error" 
const { Readable, Writable } = require("node:stream");

const source = new Readable({ read() { this.destroy(new Error("source failed")); } });
const dest = new Writable({ write(c, e, cb) { cb(); } });

source.on("error", (e) => console.log("source error caught:", e.message));
source.pipe(dest);

setTimeout(() => console.log("destination destroyed after the failure?", dest.destroyed, "(pipe did NOT clean it up)"), 20);
```

## `pipeline()`: the right tool

`stream.pipeline` (and the promise version `stream/promises`) connects **any number of streams**, handles backpressure, **forwards the first error** to one callback or promise, and **destroys all the streams** to avoid leaks.

```js run node title="pipeline: errors and cleanup done properly"
const { pipeline } = require("node:stream/promises");
const { Readable, Writable, Transform } = require("node:stream");

const upper = new Transform({
  transform(chunk, enc, cb) { cb(null, chunk.toString().toUpperCase()); },
});

(async () => {
  const output = [];
  const sink = new Writable({ write(c, e, cb) { output.push(c.toString()); cb(); } });

  // success
  await pipeline(Readable.from(["a", "b", "c"]), upper, sink);
  console.log("success:", output);

  // failure: the first error rejects the promise and EVERY stream is destroyed
  const failing = new Transform({ transform(chunk, enc, cb) { cb(chunk.toString() === "b" ? new Error("bad chunk 'b'") : null, chunk); } });
  const src = Readable.from(["a", "b", "c"]);
  const dst = new Writable({ write(c, e, cb) { cb(); } });
  try {
    await pipeline(src, failing, dst);
  } catch (e) {
    console.log("pipeline rejected:", e.message, "| all destroyed:", src.destroyed && failing.destroyed && dst.destroyed);
  }
})();
```

You can also put **async generator functions** in a pipeline. This is a very readable way to write transformations:

```js run node title="Async generators inside pipeline"
const { pipeline } = require("node:stream/promises");
const { Readable, Writable } = require("node:stream");

(async () => {
  const lines = [];
  await pipeline(
    Readable.from(["apple\nbanana\n", "cherry\n"]),
    async function* (source) {                                   // a transform written as an async generator
      let leftover = "";
      for await (const chunk of source) {
        const parts = (leftover + chunk).split("\n");
        leftover = parts.pop();                                  // the last piece may be incomplete
        for (const line of parts) yield line.toUpperCase() + "\n";
      }
      if (leftover) yield leftover.toUpperCase() + "\n";
    },
    new Writable({ write(c, e, cb) { lines.push(c.toString().trim()); cb(); } }),
  );
  console.log(lines);
})();
```

## Real example: gzip a file

```js
const { pipeline } = require("node:stream/promises");
const fs = require("node:fs");
const zlib = require("node:zlib");

await pipeline(
  fs.createReadStream("big.log"),          // read in 64 KB chunks
  zlib.createGzip(),                        // compress each chunk
  fs.createWriteStream("big.log.gz"),      // write, with backpressure all the way back to the disk read
);                                          // errors anywhere reject this promise; all files are closed
```

Memory stays at a few hundred KB, even for a 50 GB file.

## Summary of rules

1. **Respect `write()`'s return value**: if `false`, wait for `'drain'`.
2. **Prefer `pipeline()`** over `pipe()`: error forwarding and cleanup.
3. **Handle `'error'` on every stream** (pipeline does it for you).
4. Use `for await...of` to **read**: it applies backpressure automatically.
5. **Never accumulate** a whole stream into a string/array if the data can be large.
6. Set a sensible **`highWaterMark`** only if you have measured a need.

:::interview What is backpressure in Node.js streams and how do you handle it? Why prefer pipeline over pipe?
"Backpressure is how a slow consumer slows a fast producer so data does not pile up in memory. A writable's `write()` returns false when its internal buffer reaches `highWaterMark`, and the producer should stop until the `drain` event. `readable.pipe(writable)` does this automatically by pausing and resuming the readable. But `pipe` does not propagate errors or destroy the other streams, which can leak file descriptors, so I use `stream.pipeline` or the promise version, which handles backpressure, forwards the first error and destroys every stream. For reading I use `for await`, which also respects backpressure."
:::

## More interview questions on this topic

:::qa What does it mean when `writable.write()` returns false? {level=medium}
**Say this:** "The internal buffer is at or over its highWaterMark. The data is still queued, not lost, but I should stop writing and wait for the `drain` event."

**In simple words:** "I am full for now. Please wait."
:::

:::qa What happens if you ignore backpressure? {level=medium}
**Say this:** "The writable's buffer grows without bound, memory use rises and the process may run out of memory, while the data may also be held far longer than needed."

**In simple words:** The pile of waiting data keeps growing in RAM.
:::

:::qa What are the drawbacks of `pipe()`? {level=hard}
**Say this:** "No automatic error propagation between the streams, no cleanup when one fails (so descriptors can leak), and you must add error handlers to each stream. `pipeline` solves this."

**In simple words:** pipe connects the pipes but does not catch leaks.
:::

:::qa How do you stream a large file to an HTTP response safely? {level=medium}
**Say this:** "`await pipeline(fs.createReadStream(file), res)` (or `stream.pipeline` with a callback): backpressure respects the client's speed, and errors or a client disconnect destroy the file stream."

**In simple words:** Never `readFile` then `res.end(data)` for big files.
:::

```quiz
? What should you do when write() returns false?
- Keep writing
+ Wait for the 'drain' event
- Destroy the stream
> The buffer is full.
? Which handles errors and cleanup of all streams?
- readable.pipe(writable)
+ stream.pipeline(...)
- readable.on('data')
> pipeline destroys all streams on failure.
? What is backpressure?
- Compression of data
+ A slow consumer signalling a fast producer to slow down
- A kind of Transform
> It prevents unbounded buffering.
```

:::keypoints
- **Backpressure** = slow consumer slows the producer. `write()` → `false` ⇒ wait for **`drain`**.
- **`pipe()`** pauses/resumes automatically but **does not propagate errors** or clean up.
- **`pipeline()`** (and `stream/promises`) = backpressure + **first error** + **destroy all streams**. Accepts **async generators**.
- Read with **`for await`**. Never buffer a whole large stream. `highWaterMark` = internal buffer size.
:::
