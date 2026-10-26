---
title: EventEmitter and the core modules you must know
level: intermediate
time: 35
summary: How EventEmitter works (on, once, emit, error events, listener limits, async iteration), and a practical tour of fs/promises, path, os, url, util, crypto, timers/promises and readline with runnable examples.
---

## EventEmitter: the observer pattern in Node

Much of Node (streams, HTTP servers, sockets, child processes, process) is built on **`EventEmitter`**: an object that can **emit named events** and let others **listen**.

```js run node title="EventEmitter basics"
const { EventEmitter } = require("node:events");

const orders = new EventEmitter();

orders.on("placed", (id, total) => console.log("1. email: order", id, "total", total));
orders.on("placed", (id) => console.log("2. stock: reserve items for", id));
orders.once("placed", () => console.log("3. (once) first-order bonus"));      // removed after the first emit
orders.prependListener("placed", () => console.log("0. audit log (prepended)"));

console.log("listeners:", orders.listenerCount("placed"), "| events:", orders.eventNames());

console.log(orders.emit("placed", 101, 499));                  // returns true if there were listeners
console.log("--- second order ---");
orders.emit("placed", 102, 80);
console.log(orders.emit("nobody-listens"));                    // false
```

Key facts:

- Listeners run **synchronously**, **in the order registered** (use `prependListener` to go first).
- **`emit` is synchronous**: it returns after every listener has finished. If you want async, do it inside the listener.
- `once` auto-removes the listener. `off`/`removeListener(event, fn)` needs the **same function reference**.
- `this` inside a normal-function listener is the emitter. (Arrow functions do not get it.)

## The special `error` event

If an emitter emits **`"error"`** and **nobody listens**, Node **throws** the error and the process crashes (uncaught exception). Always add an `error` listener to emitters that can fail (streams, sockets, servers, child processes).

```js run node title="Unhandled 'error' events throw"
const { EventEmitter } = require("node:events");
const emitter = new EventEmitter();

try {
  emitter.emit("error", new Error("nobody was listening"));
} catch (e) {
  console.log("thrown synchronously:", e.message);
}

emitter.on("error", (err) => console.log("handled:", err.message));
emitter.emit("error", new Error("now someone listens"));
```

## Extending EventEmitter

```js run node title="A class that is an emitter"
const { EventEmitter } = require("node:events");

class Downloader extends EventEmitter {
  async download(url) {
    this.emit("start", url);
    for (let pct = 25; pct <= 100; pct += 25) {
      await new Promise((r) => setTimeout(r, 5));
      this.emit("progress", url, pct);
    }
    if (url.includes("broken")) { this.emit("error", new Error("404 " + url)); return; }
    this.emit("done", url);
  }
}

const d = new Downloader();
d.on("start", (u) => console.log("start", u));
d.on("progress", (u, p) => console.log(" ", p + "%"));
d.on("done", (u) => console.log("done", u));
d.on("error", (e) => console.log("error:", e.message));

d.download("file-a").then(() => d.download("broken-file"));
```

## Memory-leak warning and `EventEmitter.once`

Adding **more than 10 listeners** for one event prints `MaxListenersExceededWarning`. It is usually a **bug** (a listener added in a loop or on each request and never removed). Raise it with `emitter.setMaxListeners(n)` only when it is truly intended.

Awaiting an event, and iterating events:

```js run node title="events.once() and events.on() (async iterator)"
const { EventEmitter, once, on } = require("node:events");

(async () => {
  const e = new EventEmitter();

  setTimeout(() => e.emit("ready", "payload", 42), 10);
  const [first, second] = await once(e, "ready");                   // a promise of the event arguments
  console.log("once:", first, second);

  const ac = new AbortController();
  setTimeout(() => { e.emit("tick", 1); e.emit("tick", 2); e.emit("tick", 3); ac.abort(); }, 10);
  try {
    for await (const [n] of on(e, "tick", { signal: ac.signal })) console.log("tick", n);
  } catch (err) { if (err.name !== "AbortError") throw err; console.log("stopped by abort"); }
})();
```

## `fs/promises`: files

```js run node title="Read, write, list and stat files"
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-demo-"));
  const file = path.join(dir, "notes.txt");

  await fs.writeFile(file, "line one\nline two\n");
  await fs.appendFile(file, "line three\n");
  const text = await fs.readFile(file, "utf8");
  console.log(text.split("\n").filter(Boolean));

  await fs.mkdir(path.join(dir, "sub/deeper"), { recursive: true });
  await fs.copyFile(file, path.join(dir, "sub/copy.txt"));
  console.log((await fs.readdir(dir, { withFileTypes: true })).map((e) => `${e.name}${e.isDirectory() ? "/" : ""}`).sort());

  const stat = await fs.stat(file);
  console.log("size:", stat.size, "| isFile:", stat.isFile(), "| mtime is a Date:", stat.mtime instanceof Date);

  try { await fs.readFile(path.join(dir, "missing.txt")); } catch (e) { console.log(e.code, e.syscall); }
  console.log(await fs.access(file).then(() => "exists", () => "missing"));

  await fs.rename(file, path.join(dir, "renamed.txt"));
  await fs.rm(dir, { recursive: true, force: true });
  console.log("cleaned up");
})();
```

Remember: for **big files** use **streams** (next module), not `readFile`.

## `path`, `os`, `url`

```js run node title="path, os and url"
const path = require("node:path");
const os = require("node:os");

console.log(path.join("/data", "users", "..", "logs", "app.log"));        // normalises
console.log(path.resolve("/base", "sub", "../file.txt"));                 // absolute path
console.log(path.basename("/a/b/photo.final.png"), path.extname("photo.final.png"), path.dirname("/a/b/c.txt"));
console.log(path.parse("/home/asha/report.pdf"));
console.log(path.relative("/data/a/b", "/data/c"), path.isAbsolute("./x"), path.sep);

console.log(os.EOL === "\n", typeof os.cpus().length, typeof os.totalmem(), os.platform().length > 0);

const u = new URL("https://user:pw@example.com:8080/path/to?name=Asha&tags=a&tags=b#top");
console.log(u.hostname, u.port, u.pathname, u.searchParams.get("name"), u.searchParams.getAll("tags"), u.hash);
u.searchParams.append("page", "2");
console.log(u.search, new URLSearchParams({ q: "node js", page: 1 }).toString());
```

Never build paths with string concatenation (`dir + "/" + name`): use `path.join`. Never build URLs by hand: use `URL` and `URLSearchParams` (they handle encoding).

## `util`

```js run node title="util: promisify, inspect, format, types, parseArgs"
const util = require("node:util");

const sleep = util.promisify((ms, cb) => setTimeout(() => cb(null, "slept " + ms), ms));
sleep(5).then(console.log);

console.log(util.format("%s has %d items (%j) %o", "cart", 3, { a: 1 }, [1]));
console.log(util.inspect({ a: { b: { c: { d: 1 } } } }, { depth: 0 }), util.inspect({ a: { b: { c: { d: 1 } } } }, { depth: null }));
console.log(util.isDeepStrictEqual({ a: [1, 2] }, { a: [1, 2] }), util.types.isPromise(Promise.resolve()));
console.log(util.styleText?.("red", "colour") !== undefined);
console.log(util.parseArgs({ args: ["--name", "Asha", "-v", "file.txt"], options: { name: { type: "string" }, v: { type: "boolean", short: "v" } }, allowPositionals: true }).values);
```

## `crypto`

```js run node title="crypto: hashes, HMAC, random values, password hashing"
const crypto = require("node:crypto");

console.log(crypto.createHash("sha256").update("hello").digest("hex"));
console.log(crypto.createHmac("sha256", "secret-key").update("message").digest("base64").length);
console.log(crypto.randomUUID().length, crypto.randomBytes(8).length, crypto.randomInt(1, 7) >= 1);

// password hashing: use scrypt (or bcrypt/argon2), never a plain hash
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync("my password", salt, 32);
const check = crypto.scryptSync("my password", salt, 32);
console.log("password check:", crypto.timingSafeEqual(hash, check));          // constant-time comparison

// symmetric encryption (AES-256-GCM)
const key = crypto.randomBytes(32), iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const encrypted = Buffer.concat([cipher.update("secret data", "utf8"), cipher.final()]);
const tag = cipher.getAuthTag();
const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv).setAuthTag(tag);
console.log(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString());
```

## `timers/promises` and `readline`

```js run node title="Promise-based timers, and reading a stream line by line"
const { setTimeout: sleep, setImmediate: nextLoop } = require("node:timers/promises");
const readline = require("node:readline");
const { Readable } = require("node:stream");

(async () => {
  console.log(await sleep(10, "slept (resolved value)"));
  await nextLoop();

  const lines = readline.createInterface({ input: Readable.from(["alpha\nbeta\n", "gamma\n"]) });
  for await (const line of lines) console.log("line:", line);
})();
```

## Other modules worth knowing by name

| Module | For |
|---|---|
| `http`, `https`, `http2`, `net`, `tls`, `dgram`, `dns` | networking |
| `stream`, `zlib`, `buffer` | data streams, compression, binary data (next module) |
| `child_process`, `cluster`, `worker_threads` | processes and threads |
| `assert`, `node:test` | assertions and the built-in test runner (`node --test`) |
| `perf_hooks`, `async_hooks`, `diagnostics_channel` | performance and tracing |
| `vm`, `v8`, `inspector` | sandboxes and internals |
| `readline`, `tty` | interactive CLIs |

:::interview How does EventEmitter work? What happens with the "error" event?
"EventEmitter keeps a map from event names to lists of listeners. `on` adds a listener, `once` a one-shot, `emit` calls the listeners synchronously in the order registered with the given arguments and returns whether anyone listened. The special event name `error` is treated differently: if it is emitted and there is no listener, Node throws the error, which crashes the process if uncaught, so emitters that can fail must have an error listener. More than ten listeners for one event triggers a leak warning. Streams, servers, sockets and processes are all EventEmitters."
:::

## More interview questions on this topic

:::qa Are EventEmitter listeners called synchronously or asynchronously? {level=easy}
**Say this:** "Synchronously, in registration order, when `emit` is called. If I need async behaviour I do it inside the listener, for example with `setImmediate`."

**In simple words:** `emit` does not return until all listeners finish.
:::

:::qa How do you remove a listener? {level=easy}
**Say this:** "`emitter.off(event, handler)` or `removeListener`, with the same function reference that was added; `once` removes itself; `removeAllListeners(event)` clears all."

**In simple words:** An inline arrow function cannot be removed later: keep a reference.
:::

:::qa Why use `path.join` instead of string concatenation? {level=easy}
**Say this:** "It uses the correct separator for the OS and normalises `..` and duplicate separators. Concatenation breaks on Windows and invites path-traversal bugs."

**In simple words:** `path.join` knows the OS rules.
:::

:::qa How should you store passwords in a Node app? {level=medium}
**Say this:** "With a slow, salted password hashing function: `crypto.scrypt`, bcrypt or argon2, with a unique random salt per user, and compare with a constant-time function. Never store plain text or fast hashes like SHA-256."

**In simple words:** Make guessing slow and unique for each user.
:::

```quiz
? What happens if an EventEmitter emits "error" with no listener?
- It is ignored
+ The error is thrown
- A warning is printed
> This can crash the process.
? Are emit() listeners called synchronously?
- No, on the next tick
+ Yes, in registration order
- Randomly
> emit blocks until all listeners return.
? Which is the right way to build a file path?
- dir + "/" + file
+ path.join(dir, file)
- `${dir}${file}`
> Portable and normalised.
```

:::keypoints
- **EventEmitter**: `on`, `once`, `off`, `emit` (sync, ordered), `prependListener`; `events.once()` and `events.on()` for promises/async iteration.
- Emitting **`error`** with no listener **throws**. Beware >10 listeners (leaks).
- Core modules: **`fs/promises`, `path`, `os`, `url`/`URL`, `util` (promisify, inspect, parseArgs), `crypto` (hash, hmac, scrypt, randomUUID), `timers/promises`, `readline`**.
- Use `path.join`, `URL`/`URLSearchParams`, `scrypt`/bcrypt, streams for big files.
:::
