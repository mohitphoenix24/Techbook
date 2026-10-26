---
title: Implement Node stream transforms and respect backpressure
level: hard
time: 40
summary: Build a line splitter that survives chunk boundaries and split UTF-8 characters, an NDJSON parser, and a producer that honours write() and drain. Measure what ignoring backpressure costs.
---

:::problem Implement stream transforms {level=hard tags="node,streams,backpressure,utf-8"}
1. `LineSplitter` (a `Transform`): turn arbitrary byte chunks into **one object per line**.
   - A line may be **split across chunks**.
   - A multi-byte UTF-8 character may be **split across chunks**.
   - `\r\n` and `\n` are both line endings; the last line may have no newline.
2. `JsonLines` (a `Transform` in object mode): parse each line as JSON. A bad line fails the whole pipeline with `Bad JSON on line N`, and the **source is destroyed**.
3. A producer function `writeAll(writable, chunks)` that **respects backpressure**: when `write()` returns `false`, wait for `drain`.
4. Show with numbers what happens if the producer **ignores** `write()`'s return value.

:::hint Hint
Keep the unfinished part of the last line in a variable, and use `StringDecoder` so a half character waits for its second half. Use `stream/promises.pipeline` so errors destroy every stream.
:::
:::

## Solution and tests

```js run cjs node title="LineSplitter, JsonLines and backpressure, with tests"
const assert = require("node:assert/strict");
const { Transform, Writable, Readable } = require("node:stream");
const { pipeline, finished } = require("node:stream/promises");
const { once } = require("node:events");
const { StringDecoder } = require("node:string_decoder");

const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

class LineSplitter extends Transform {
  constructor() {
    super({ readableObjectMode: true });                     // bytes in, strings (lines) out
    this.decoder = new StringDecoder("utf8");                // keeps half characters until the other half arrives
    this.rest = "";
  }
  _transform(chunk, encoding, callback) {
    this.rest += this.decoder.write(chunk);
    const lines = this.rest.split("\n");
    this.rest = lines.pop();                                 // the last piece may be incomplete: keep it
    for (const line of lines) this.push(line.endsWith("\r") ? line.slice(0, -1) : line);
    callback();
  }
  _flush(callback) {                                         // the input ended: whatever is left is the last line
    this.rest += this.decoder.end();
    if (this.rest) this.push(this.rest);
    callback();
  }
}

class JsonLines extends Transform {
  constructor() { super({ objectMode: true }); this.n = 0; }
  _transform(line, encoding, callback) {
    this.n++;
    if (!line.trim()) return callback();                     // skip blank lines
    let value;
    try { value = JSON.parse(line); } catch { return callback(new Error(`Bad JSON on line ${this.n}`)); }
    callback(null, value);
  }
}

async function writeAll(writable, chunks) {
  for (const chunk of chunks) {
    if (!writable.write(chunk)) await once(writable, "drain");   // buffer full: wait until it has emptied
  }
  writable.end();
  await finished(writable);
}

const collect = async (readable) => { const out = []; for await (const x of readable) out.push(x); return out; };
const chunked = (buffer, size) => Array.from({ length: Math.ceil(buffer.length / size) }, (_, i) => buffer.subarray(i * size, (i + 1) * size));

// ---------------- tests ----------------
(async () => {
  await test("lines split across chunks come out whole", async () => {
    const lines = await collect(Readable.from([Buffer.from("hel"), Buffer.from("lo\nwor"), Buffer.from("ld\nlast")]).pipe(new LineSplitter()));
    assert.deepEqual(lines, ["hello", "world", "last"]);
  });

  await test("any chunk size gives the same lines (even 1 byte), including split UTF-8", async () => {
    const text = "héllo wörld 😀\nsecond line — ✓\r\nthird";
    const expected = ["héllo wörld 😀", "second line — ✓", "third"];
    for (const size of [1, 2, 3, 5, 7, 64]) {
      const lines = await collect(Readable.from(chunked(Buffer.from(text), size)).pipe(new LineSplitter()));
      assert.deepEqual(lines, expected, "chunk size " + size);
    }
  });

  await test("without StringDecoder, a split character is corrupted (the bug we avoid)", () => {
    const bytes = Buffer.from("é");                           // 2 bytes
    const broken = bytes.subarray(0, 1).toString() + bytes.subarray(1).toString();
    assert.notEqual(broken, "é");
    assert.ok(broken.includes("�"));
  });

  await test("a trailing newline does not create an empty last line", async () => {
    assert.deepEqual(await collect(Readable.from([Buffer.from("a\nb\n")]).pipe(new LineSplitter())), ["a", "b"]);
  });

  await test("NDJSON: lines become objects", async () => {
    const input = Readable.from([Buffer.from('{"id":1}\n{"id"'), Buffer.from(':2}\n\n{"id":3}')]);
    const out = [];
    await pipeline(input, new LineSplitter(), new JsonLines(), async function* (objects) { for await (const o of objects) out.push(o.id); });
    assert.deepEqual(out, [1, 2, 3]);
  });

  await test("a bad line fails the pipeline and destroys the source", async () => {
    const source = Readable.from([Buffer.from('{"ok":1}\nnot json\n{"ok":3}\n')]);
    await assert.rejects(pipeline(source, new LineSplitter(), new JsonLines(), new Writable({ objectMode: true, write(c, e, cb) { cb(); } })), /Bad JSON on line 2/);
    assert.equal(source.destroyed, true);                      // pipeline cleans up; plain .pipe() would leave it open
  });

  await test("an async generator can be a transform stage", async () => {
    const out = await collect(Readable.from(["a", "b"]).compose(async function* (src) { for await (const x of src) yield x.toUpperCase(); }));
    assert.deepEqual(out, ["A", "B"]);
  });

  // ---- backpressure ----
  const slowSink = () => new Writable({ highWaterMark: 50, write(chunk, encoding, callback) { setTimeout(callback, 1); } });
  const tenBytes = () => Array.from({ length: 40 }, () => Buffer.alloc(10));

  await test("ignoring write()'s return value buffers everything in memory", async () => {
    const sink = slowSink();
    let peak = 0;
    for (const chunk of tenBytes()) { sink.write(chunk); peak = Math.max(peak, sink.writableLength); }   // never waits
    sink.end(); await finished(sink);
    assert.ok(peak >= 300, "peak buffered bytes was " + peak);   // 40 chunks x 10 bytes pile up while the sink works slowly
  });

  await test("respecting backpressure keeps the buffer near highWaterMark", async () => {
    const sink = slowSink();
    let peak = 0;
    sink.on("pipe", () => {});
    const original = sink.write.bind(sink);
    sink.write = (chunk) => { const ok = original(chunk); peak = Math.max(peak, sink.writableLength); return ok; };
    await writeAll(sink, tenBytes());
    assert.ok(peak <= 60, "peak buffered bytes was " + peak);
  });

  await test("write() returns false once the buffer reaches the highWaterMark", async () => {
    const sink = slowSink();
    const results = Array.from({ length: 6 }, () => sink.write(Buffer.alloc(10)));
    assert.deepEqual(results, [true, true, true, true, false, false]);
    sink.end(); await finished(sink);
  });
})();
```

## The backpressure rule in one line

`write()` returns **`false`** = "my buffer is full: **stop** writing until **`'drain'`**". `pipe()` and `pipeline()` do this for you; a hand-written loop must do it itself. Without it, memory grows with the size of the data, and a 5 GB file crashes a 512 MB container.

## Pipeline, not pipe

| | `a.pipe(b)` | `pipeline(a, b, c)` |
|---|---|---|
| Errors | **not forwarded**: you must listen on every stream | forwarded, and every stream is **destroyed** |
| Cleanup | source may stay open (file descriptor leak) | all closed |
| Async result | none | a promise (`stream/promises`) |
| Generators as stages | no | yes |

:::qa Why can't I just `chunk.toString().split("\n")` in a transform? {level=medium}
**Say this:** "Chunks are arbitrary byte slices. A line can be cut in the middle, and so can a multi-byte character. I must keep the unfinished last line for the next chunk, and decode with `StringDecoder` so partial characters wait for their other half."

**In simple words:** A chunk is not a line, and not even a whole letter.
:::

:::qa What are `highWaterMark`, `writableLength` and `'drain'`? {level=medium}
**Say this:** "`highWaterMark` is the buffer size at which `write()` starts returning false (16 KB for byte streams, 16 objects in object mode). `writableLength` is the number of bytes currently buffered. `'drain'` is emitted when the buffer has emptied and it is safe to write again."

**In simple words:** The size of the waiting room, how full it is now, and the 'you may come in' signal.
:::

:::qa How do Web Streams differ? {level=hard}
**Say this:** "They are the browser and standard version: `ReadableStream`, `WritableStream`, `TransformStream`, with backpressure built into the promise-based `pull` and `write` methods and a `desiredSize`. Node can convert between them (`Readable.toWeb`, `Readable.fromWeb`) and `fetch` bodies are Web Streams."

**In simple words:** Same idea, a different and standard API that also works in the browser.
:::

:::keypoints
- Chunks are **not lines and not characters**: keep the leftover, use **`StringDecoder`**, flush in **`_flush`**.
- **`write()` returns false ⇒ wait for `'drain'`**; ignoring it grows memory with the data size.
- Use **`stream/promises.pipeline`**: errors propagate and all streams are destroyed.
- Object mode (`readableObjectMode`) lets a stage turn bytes into lines or objects.
:::
