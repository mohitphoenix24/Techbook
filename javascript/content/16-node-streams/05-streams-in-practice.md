---
title: Streams in practice: HTTP, uploads, web streams and a memory test
level: advanced
time: 35
summary: Streaming a file to an HTTP response, handling uploads and proxies, the Web Streams API and fetch bodies, server-sent events, NDJSON, and a memory comparison between readFile and streaming.
---

## Serving a big file over HTTP

```js run node title="Stream a file to the client (with a client request to test it)"
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");

const file = path.join(os.tmpdir(), "download-demo.bin");
fs.writeFileSync(file, Buffer.alloc(2_000_000, 7));                      // a 2 MB demo file

const server = http.createServer(async (req, res) => {
  try {
    const { size } = await fs.promises.stat(file);
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": size });
    await pipeline(fs.createReadStream(file), res);                      // backpressure: the speed of the CLIENT sets the pace
  } catch (err) {
    if (!res.headersSent) { res.statusCode = 500; res.end("error"); }
    else res.destroy(err);                                               // the client disconnected: pipeline already closed the file stream
  }
});

server.listen(0, async () => {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/`);
  let bytes = 0, chunks = 0;
  for await (const chunk of response.body) { bytes += chunk.length; chunks++; }       // the response body is async iterable too
  console.log("client received", bytes, "bytes in", chunks > 1 ? "several chunks" : "one chunk");
  server.close();
  fs.unlinkSync(file);
});
```

The bad version: `fs.readFile(file, (err, data) => res.end(data))`. It loads the whole file for **every request**: 100 simultaneous downloads of a 1 GB file need 100 GB of RAM.

For production file serving also add: **Range requests** (resume/seek), **ETag/Last-Modified caching**, compression, and consider a CDN or **`X-Accel-Redirect`/`sendfile`** from the web server.

## Handling uploads as a stream

The HTTP **request** is a readable stream. Pipe it to disk (or to S3) instead of collecting it.

```js run node title="Receive an upload and write it straight to disk"
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { pipeline } = require("node:stream/promises");
const { Transform } = require("node:stream");

const target = path.join(os.tmpdir(), "upload-demo.bin");
const server = http.createServer(async (req, res) => {
  let size = 0;
  const hash = crypto.createHash("md5");
  const MAX = 5_000_000;
  const guard = new Transform({
    transform(chunk, enc, cb) {
      size += chunk.length;
      if (size > MAX) return cb(new Error("payload too large"));            // reject early: stop reading
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  try {
    await pipeline(req, guard, fs.createWriteStream(target));
    res.end(JSON.stringify({ size, md5: hash.digest("hex") }));
  } catch (e) {
    res.statusCode = 413; res.end(e.message);
  }
});

server.listen(0, async () => {
  const { port } = server.address();
  const body = Buffer.alloc(1_000_000, "a");
  const r = await fetch(`http://127.0.0.1:${port}/`, { method: "POST", body });
  console.log(r.status, await r.json(), crypto.createHash("md5").update(body).digest("hex"));
  server.close();
  fs.unlinkSync(target);
});
```

Security tips: **limit the size**, validate content type, never trust the filename, store outside the web root, scan if needed. For multipart forms use **busboy**, **formidable** or **multer** (they stream too).

## A streaming proxy

```js run node title="Pipe an incoming request to another server and back"
const http = require("node:http");
const { pipeline } = require("node:stream/promises");

const backend = http.createServer((req, res) => res.end("hello from the backend"));

backend.listen(0, () => {
  const backendPort = backend.address().port;
  const proxy = http.createServer((req, res) => {
    const upstream = http.request({ port: backendPort, path: req.url, method: req.method, headers: req.headers }, async (up) => {
      res.writeHead(up.statusCode, up.headers);
      await pipeline(up, res).catch(() => {});                              // upstream response -> client
    });
    pipeline(req, upstream).catch(() => upstream.destroy());                // client request -> upstream
  });

  proxy.listen(0, async () => {
    const r = await fetch(`http://127.0.0.1:${proxy.address().port}/anything`);
    console.log(r.status, await r.text());
    proxy.close(); backend.close();
  });
});
```

## NDJSON and Server-Sent Events: streaming data to clients

Send results **as they become available** instead of waiting for all of them.

```js run node title="Newline-delimited JSON, consumed incrementally"
const http = require("node:http");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const server = http.createServer(async (req, res) => {
  res.writeHead(200, { "Content-Type": "application/x-ndjson" });
  async function* rows() {
    for (let i = 1; i <= 3; i++) {
      await new Promise((r) => setTimeout(r, 20));                            // each row takes time to compute
      yield JSON.stringify({ id: i, square: i * i }) + "\n";
    }
  }
  await pipeline(Readable.from(rows()), res);
});

server.listen(0, async () => {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });                        // { stream: true } handles split characters
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      console.log("row arrived:", JSON.parse(buffer.slice(0, nl)));
      buffer = buffer.slice(nl + 1);
    }
  }
  server.close();
});
```

**Server-Sent Events (SSE)** work the same way for the browser: `Content-Type: text/event-stream`, messages as `data: ...\n\n`, consumed by `new EventSource(url)`. (Use WebSockets for two-way traffic.)

## Web Streams API (the browser-standard streams)

Browsers, Deno, Bun, Cloudflare Workers and Node (18+) share a **web-standard** streams API: `ReadableStream`, `WritableStream`, `TransformStream`. `fetch` bodies are `ReadableStream`s.

```js run title="Web streams: ReadableStream, TransformStream and pipeThrough"
const source = new ReadableStream({
  start(controller) {
    ["alpha", "beta", "gamma"].forEach((s) => controller.enqueue(s));
    controller.close();
  },
});

const upper = new TransformStream({
  transform(chunk, controller) { controller.enqueue(chunk.toUpperCase()); },
});

(async () => {
  const reader = source.pipeThrough(upper).getReader();
  const out = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out.push(value);
  }
  console.log(out);

  // async iteration works in modern runtimes
  const again = new ReadableStream({ pull(c) { c.enqueue("x"); c.close(); } });
  for await (const v of again) console.log("async iterated:", v);
})();
```

Convert between the two worlds in Node: `Readable.toWeb(nodeStream)`, `Readable.fromWeb(webStream)`, `Readable.from(webStream)`. Built-in web transforms: `new CompressionStream("gzip")`, `new TextDecoderStream()`.

```js run title="CompressionStream and TextDecoderStream"
(async () => {
  const text = "hello hello hello hello ".repeat(100);
  const compressed = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressedBytes = new Uint8Array(await new Response(compressed).arrayBuffer());
  console.log("compressed smaller than the original:", compressedBytes.length < text.length);

  const back = new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream("gzip")).pipeThrough(new TextDecoderStream());
  let result = "";
  for await (const part of back) result += part;
  console.log("round trip:", result === text);
})();
```

## Measuring memory: readFile vs stream

```js run node title="Peak memory while processing a 200 MB file" nondet
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { pipeline } = require("node:stream/promises");
const { Writable } = require("node:stream");

const file = path.join(os.tmpdir(), "mem-demo.bin");
const chunk = Buffer.alloc(1024 * 1024, 1);
const out = fs.createWriteStream(file);
for (let i = 0; i < 200; i++) out.write(chunk);                              // 200 MB (the buffer drains while we wait below)

out.end(async () => {
  let peak = 0;
  const sample = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 5);
  const mb = (n) => Math.round(n / 1024 / 1024);

  global.gc(); const base = process.memoryUsage().rss; peak = base;
  const data = await fs.promises.readFile(file);                              // whole file in memory
  crypto.createHash("sha256").update(data).digest("hex");
  const readFilePeak = peak - base;

  global.gc(); peak = process.memoryUsage().rss;
  const base2 = peak;
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file), new Writable({ write(c, e, cb) { hash.update(c); cb(); } }));
  const streamPeak = peak - base2;
  clearInterval(sample);

  console.log("readFile used more than 150 MB extra:", mb(readFilePeak) > 150);
  console.log("streaming used less than 60 MB extra:", mb(streamPeak) < 60);
  fs.unlinkSync(file);
});
```

Memory use of streaming is flat; `readFile` grows with the file size.

:::interview How would you serve or process a very large file in Node.js without running out of memory?
"I stream it: `fs.createReadStream` piped through any transforms (parse, compress, hash) to the destination with `stream.pipeline`, so data moves in 64 KB chunks and backpressure from the slow side, such as the client's network, pauses the disk reads. For HTTP downloads I set Content-Length and use `pipeline(fs.createReadStream(file), res)` with error handling; for uploads I pipe the request to disk or object storage while enforcing a size limit; for parsing I use line or record Transforms in object mode. I would support Range requests and caching headers, or offload to a CDN. Readfile would need RAM equal to the file size for every concurrent request."
:::

## More interview questions on this topic

:::qa How do you handle a client disconnecting during a streamed download? {level=hard}
**Say this:** "With `pipeline(readStream, res)`, when the response closes early the pipeline rejects and destroys the file stream, so no file descriptor leaks. With plain `pipe` I would have to listen to `close` and destroy the source myself."

**In simple words:** pipeline notices the other end left and cleans up.
:::

:::qa What is the difference between Node streams and Web Streams? {level=medium}
**Say this:** "Node streams are the older EventEmitter-based API (`Readable`, `Writable`, `Transform`, `pipeline`). Web Streams (`ReadableStream`, `WritableStream`, `TransformStream`) are the WHATWG standard shared by browsers, `fetch`, Deno, Bun and recent Node, with promise-based readers. You can convert between them."

**In simple words:** Two stream families: Node's own, and the web standard.
:::

:::qa How do you stream results from a database query to an HTTP client? {level=medium}
**Say this:** "Use the driver's cursor or stream (`pg-query-stream`, Mongoose `cursor()`), transform rows to NDJSON or JSON array pieces, and pipeline into the response, so memory stays flat and the client sees data early."

**In simple words:** Send row by row instead of building one giant array.
:::

:::qa Why should an upload handler enforce a maximum size while streaming? {level=medium}
**Say this:** "Streams do not limit size themselves, so an attacker could send endless data and fill the disk. Count bytes in a Transform and abort with an error (413) when over the limit."

**In simple words:** Stop reading when the limit is crossed.
:::

```quiz
? Why is pipeline(fs.createReadStream(f), res) better than readFile then res.end?
- It is shorter
+ Constant memory and backpressure from the client's speed
- It compresses data
> The file is read in chunks, as fast as the client can take it.
? What type is the body of a fetch Response?
- Buffer
+ A ReadableStream (async iterable)
- A string
> Web Streams.
? What does the NDJSON format allow?
- Binary data
+ Sending one JSON object per line, processed as it arrives
- Two-way communication
> Easy to stream and parse incrementally.
```

:::keypoints
- **Download**: `pipeline(createReadStream(file), res)` (set `Content-Length`, handle disconnects, support Range/caching). **Upload**: `pipeline(req, guard, createWriteStream)` with a **size limit**.
- **Proxy**: pipe request ↔ response. **NDJSON/SSE**: stream results as they are produced.
- **Web Streams** (`ReadableStream`, `TransformStream`, `CompressionStream`) are standard across browsers, `fetch`, Deno, Bun, Node.
- Streaming memory is **flat**; `readFile` grows with the file size and with concurrency.
:::
