---
title: Streams: why they exist and how to read them
level: intermediate
time: 35
summary: The 10 GB file question, the four stream types, chunks and highWaterMark, flowing and paused modes, reading with events and for await, and the memory and time benefits over readFile.
---

## The interview question

> "Why should you not use `fs.readFile` to process a **10 GB** file? What would you do instead?"

`fs.readFile` loads the **whole file into memory** as one `Buffer` before your callback runs. For 10 GB that means:

- you need **10 GB of RAM** (Node's `Buffer` limit is about 2 to 4 GB per buffer, so it can simply **throw**, `ERR_FS_FILE_TOO_LARGE`);
- the **first byte is not processed until the last byte is read** (high latency);
- with many requests at once, memory use multiplies and the process is killed (OOM).

A **stream** reads the file **in small chunks** (64 KB by default) and lets you process each chunk and **throw it away**. Memory stays small and constant, and processing starts immediately.

```js run node title="One big buffer vs many small chunks"
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

(async () => {
  const file = path.join(os.tmpdir(), "streams-demo.txt");
  fs.writeFileSync(file, "x".repeat(1_000_000));                                  // a 1 MB file

  const whole = await fs.promises.readFile(file);
  console.log("readFile: ONE buffer of", whole.length, "bytes in memory");

  const sizes = [];
  for await (const chunk of fs.createReadStream(file)) sizes.push(chunk.length);   // chunks arrive one by one
  console.log("stream  :", sizes.length, "chunks; the largest chunk is", Math.max(...sizes), "bytes (64 KiB)");
  console.log("both read the same data:", sizes.reduce((a, b) => a + b, 0) === whole.length);
  fs.unlinkSync(file);
})();
```

Scale it up: a 10 GB file would be one 10 GB buffer, or about 160,000 chunks of 64 KB, **one at a time**.

## What is a stream?

> "A **stream** is an abstraction for **data that arrives over time** and is processed **piece by piece**."

:::analogy A water pipe, not a water tank
`readFile` is like filling a huge tank before anyone can drink. A stream is a pipe: water flows, you drink or filter it as it passes, and the pipe never needs to hold all the water at once.
:::

Streams are used everywhere in Node: **files**, **HTTP requests and responses**, **TCP sockets**, `process.stdin/stdout`, **zlib** (compression), **crypto**, child process pipes.

## The four types

| Type | You... | Examples |
|---|---|---|
| **Readable** | read data from it | `fs.createReadStream`, HTTP **request** (server), HTTP **response** (client), `process.stdin` |
| **Writable** | write data to it | `fs.createWriteStream`, HTTP **response** (server), HTTP request (client), `process.stdout` |
| **Duplex** | both, independently | TCP **socket**, `net.Socket`, WebSocket |
| **Transform** | write in, **modified** data comes out | `zlib.createGzip()`, `crypto.createCipheriv()`, your own parser |

```
Readable ──▶ Transform ──▶ Transform ──▶ Writable
 (file)       (gzip)       (encrypt)      (network)
```

All streams are **EventEmitters**. (`PassThrough` is a Transform that changes nothing.)

## Reading a Readable stream

### 1. With events (flowing mode)

```js run node title="data, end and error events"
const { Readable } = require("node:stream");

const readable = Readable.from(["alpha ", "beta ", "gamma"]);        // an easy way to make a readable

let text = "";
readable.on("data", (chunk) => { text += chunk; console.log("chunk:", chunk); });
readable.on("end", () => console.log("end: no more data. Total:", JSON.stringify(text)));
readable.on("error", (err) => console.log("error:", err.message));       // ALWAYS handle errors
readable.on("close", () => console.log("close: the stream is closed"));
```

Adding a **`data` listener** switches the stream to **flowing mode**: data is pushed to you as fast as it is read.

### 2. With `for await...of` (the modern way)

```js run node title="Async iteration: the simplest and safest"
const { Readable } = require("node:stream");

(async () => {
  const readable = Readable.from(["one\n", "two\n", "three\n"]);
  for await (const chunk of readable) console.log("got", JSON.stringify(chunk));
  console.log("done (errors would be thrown here and can be caught with try/catch)");
})();
```

It handles **errors**, **cleanup** and **backpressure** for you, so prefer it.

### 3. Paused mode with `read()`

```js run node title="Paused mode: you pull data with read()"
const { Readable } = require("node:stream");

const r = Readable.from(["a", "b", "c"]);
r.on("readable", () => {                                   // data is available to pull
  let chunk;
  while ((chunk = r.read()) !== null) console.log("read():", chunk);
});
r.on("end", () => console.log("end"));
```

## Modes and `highWaterMark`

- A readable is in **paused** mode at first. It goes to **flowing** when you add a `data` listener, call `pipe()`, or `resume()`.
- **`highWaterMark`** is the size of the **internal buffer**: how much data a stream reads ahead (default **16 KB** for most streams, **64 KB** for file streams, 16 **objects** in object mode).

```js run node title="highWaterMark controls the chunk size"
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

(async () => {
  const file = path.join(os.tmpdir(), "hwm-demo.txt");
  fs.writeFileSync(file, "y".repeat(100000));

  for (const hwm of [16 * 1024, 64 * 1024]) {
    let chunks = 0;
    for await (const _ of fs.createReadStream(file, { highWaterMark: hwm })) chunks++;
    console.log(`highWaterMark ${hwm / 1024} KiB -> ${chunks} chunks`);
  }

  for await (const chunk of fs.createReadStream(file, { start: 10, end: 19, encoding: "utf8" })) console.log("a range of bytes:", chunk);
  fs.unlinkSync(file);
})();
```

## Writing to a Writable stream

```js run node title="createWriteStream: write(), end(), and the finish event"
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

(async () => {
  const file = path.join(os.tmpdir(), "write-demo.txt");
  const out = fs.createWriteStream(file);

  out.write("line 1\n");                      // returns true/false (see the backpressure lesson)
  out.write("line 2\n");
  out.end("last line\n");                      // end() can take a final chunk, then finish

  await once(out, "finish");                   // 'finish': everything has been flushed to the OS
  console.log(JSON.stringify(fs.readFileSync(file, "utf8")));
  fs.unlinkSync(file);
})();
```

## Setting an encoding, and object mode

```js run node title="Strings instead of Buffers, and streams of objects"
const { Readable } = require("node:stream");

(async () => {
  const bytes = Readable.from([Buffer.from("héllo "), Buffer.from("wörld")]);
  bytes.setEncoding("utf8");                                 // chunks arrive as strings (and multi-byte chars are safe)
  for await (const chunk of bytes) console.log(typeof chunk, chunk);

  const objects = Readable.from([{ id: 1 }, { id: 2 }], { objectMode: true });      // each chunk is a JS value
  for await (const row of objects) console.log(row);
})();
```

## Summary: when to use streams

| Use streams for | `readFile` is fine for |
|---|---|
| Large or unknown-size data (files, uploads, downloads, logs, database exports) | Small config files, templates (a few KB or MB) |
| Data that arrives over time (sockets, HTTP bodies) | When you need the **whole** content at once (JSON.parse of a small file) |
| Pipelines: read → transform → write (compress, encrypt, parse CSV) | |
| Keeping memory flat and the first byte fast | |

:::interview Why is fs.readFile a bad choice for a 10 GB file? What are streams and the four types?
"`readFile` loads the whole file into one Buffer in memory, so it needs as much RAM as the file, may hit Node's buffer size limit, delays processing until everything is read, and multiplies memory under concurrent requests. A stream processes data in small chunks, 64 KB for file streams, so memory stays constant and work starts at once. There are four types: Readable (a file read stream, an HTTP request), Writable (a file write stream, a response), Duplex (a socket) and Transform (gzip, encryption, parsers). I consume readables with `for await...of` or pipe them with `pipeline`, and always handle errors."
:::

## More interview questions on this topic

:::qa What is `highWaterMark`? {level=medium}
**Say this:** "The size of a stream's internal buffer: for a readable, how much it reads ahead; for a writable, the level above which `write()` returns false to signal backpressure."

**In simple words:** The size of the buffer between the producer and the consumer.
:::

:::qa What is the difference between flowing and paused mode? {level=medium}
**Say this:** "In flowing mode data is pushed to your `data` handler automatically; in paused mode you pull it with `read()`. A readable starts paused and becomes flowing with a `data` listener, `pipe()` or `resume()`."

**In simple words:** Push vs pull.
:::

:::qa How do you read a very large file line by line? {level=easy}
**Say this:** "Use `readline.createInterface({ input: fs.createReadStream(path) })` and `for await (const line of rl)`. Memory stays flat."

**In simple words:** Stream it and read one line at a time.
:::

:::qa What does the `finish` event mean on a writable and `end` on a readable? {level=medium}
**Say this:** "`end` on a readable: no more data to consume. `finish` on a writable: `end()` was called and all data was flushed to the underlying system. `close` means the resource itself is closed."

**In simple words:** Readable ended = nothing left to read. Writable finished = everything written.
:::

```quiz
? What is the main memory benefit of streams?
- They compress data
+ They process data in small chunks instead of loading it all
- They use the GPU
> Memory stays low and constant.
? Which stream type compresses data?
- Readable
- Writable
+ Transform
> zlib.createGzip is a Transform.
? What starts flowing mode on a readable?
- Calling read()
+ Adding a "data" listener, pipe(), or resume()
- Setting highWaterMark
> Data is pushed after that.
```

:::keypoints
- `readFile` = **whole file in memory** (and latency, and a size limit). **Streams** = **chunks** (64 KB for files), constant memory, early processing.
- **Four types**: Readable, Writable, Duplex, Transform (all EventEmitters).
- Consume with **`for await...of`** (best), `data` events (flowing), or `read()` (paused). Always handle **`error`**.
- `highWaterMark` = internal buffer size; **object mode** for JS values; `setEncoding` for text.
- Events: readable `data/end/close`, writable `finish/close`, both `error`.
:::
