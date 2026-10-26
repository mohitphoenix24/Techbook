---
title: "Node bank: streams and buffers"
level: medium
time: 25
summary: Twelve answers on buffers and encodings, the four stream types, backpressure, pipe versus pipeline, object mode, reading big files and Web Streams.
---

:::qa What is a `Buffer`? {level=easy}
**Say this:** "A fixed-size chunk of raw bytes outside the V8 heap, a subclass of `Uint8Array`. Use it for binary data: files, network packets, crypto, images. Convert with `Buffer.from(string, 'utf8')`, `buf.toString('hex' | 'base64' | 'utf8')`."

**In simple words:** A box of numbers (bytes) for data that is not plain text.
:::

:::qa `Buffer.alloc` versus `Buffer.allocUnsafe`? {level=medium}
**Say this:** "`alloc` returns zero-filled memory. `allocUnsafe` is faster but may contain old data from other parts of the process, so you must overwrite it fully before use or you risk leaking secrets. Prefer `alloc` unless performance is proven to matter."

**In simple words:** A clean new notebook, or one with someone else's old notes still in it.
:::

:::qa Why use streams instead of reading a whole file? {level=easy}
**Say this:** "Streams process data in chunks, so memory stays small and constant (a 5 GB file can be handled in 64 KB pieces) and work starts before all the data has arrived. They also compose: read → decompress → transform → write."

**In simple words:** Drink from a tap instead of lifting the whole water tank.
:::

:::qa What are the four stream types? {level=easy}
**Say this:** "Readable (a source, like `fs.createReadStream` or an HTTP request), Writable (a destination, like a file or an HTTP response), Duplex (both independently, like a socket), and Transform (a Duplex that changes data, like gzip or a parser)."

**In simple words:** Source, destination, two-way pipe, and a pipe that changes the water.
:::

:::qa What is backpressure? {level=medium}
**Say this:** "A signal that the consumer is slower than the producer. `writable.write()` returns `false` when its buffer is full; the producer must stop and wait for the `'drain'` event. `pipe()` and `pipeline()` do this automatically. Without it, memory grows until the process crashes."

**In simple words:** 'Slow down, my bucket is full.'
:::

:::qa `pipe` versus `stream.pipeline`? {level=medium}
**Say this:** "`pipe` does not forward errors and does not destroy the other streams, which can leak file handles. `pipeline` (or `stream/promises.pipeline`) propagates errors, destroys all streams on failure and gives a callback or promise at the end."

**In simple words:** `pipeline` cleans up when something goes wrong; `pipe` does not.
:::

:::qa What is object mode? {level=medium}
**Say this:** "A stream option (`objectMode: true`) where each chunk is any JavaScript value instead of bytes. The `highWaterMark` then counts objects (default 16) rather than bytes. It is used for parsing stages: lines, JSON objects, database rows."

**In simple words:** The stream carries whole things instead of just bytes.
:::

:::qa How do you process a large file line by line? {level=easy}
**Say this:** "`readline.createInterface({ input: fs.createReadStream(path) })` with `for await (const line of rl)`, or `fs.promises.open` then `fileHandle.readLines()`. Both read in chunks and keep memory low."

**In simple words:** Read one line at a time, never the whole file.
:::

:::qa How do you stream an HTTP response from a file? {level=easy}
**Say this:** "`await pipeline(fs.createReadStream(file), res)` after setting `Content-Type`. Support range requests for video, handle `error` (404 before headers are sent), and let `pipeline` close the file if the client disconnects."

**In simple words:** Connect the file tap directly to the client's pipe.
:::

:::qa What problems can happen when converting chunks to strings? {level=hard}
**Say this:** "A multi-byte UTF-8 character can be split across two chunks, so `chunk.toString()` per chunk corrupts it. Use `setEncoding('utf8')` or a `StringDecoder`, which keeps the incomplete bytes for the next chunk."

**In simple words:** A letter can be cut in half at the chunk boundary.
:::

:::qa What are Web Streams, and how do they relate to Node streams? {level=hard}
**Say this:** "The standard `ReadableStream`, `WritableStream` and `TransformStream` used by `fetch` bodies, browsers and Deno. Node supports them and converts both ways with `Readable.fromWeb`/`toWeb`. Node's classic streams have more ecosystem support; Web Streams give code that works across runtimes."

**In simple words:** The same pipe idea with a standard API that also works in browsers.
:::

:::qa How do you read a request body safely in a plain `http` server? {level=medium}
**Say this:** "Collect chunks with a size limit (reject if it exceeds a maximum), check `Content-Type`, then parse and validate. Frameworks provide this with body-parser or built-in parsers, but you must still set limits to avoid memory exhaustion by huge uploads."

**In simple words:** Accept data in pieces, and stop when it gets too big.
:::

:::keypoints
- **Buffer** = raw bytes; prefer `alloc`; decode with the right encoding.
- **Streams** keep memory flat and start early; types: readable, writable, duplex, transform.
- **Backpressure**: `write()` false → wait for `drain`; `pipeline` handles it and cleans up.
- Use `StringDecoder` / `setEncoding` for text; set **size limits** on bodies.
:::
