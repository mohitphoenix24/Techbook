---
title: What Node.js is made of
level: intermediate
time: 25
summary: V8 plus libuv plus bindings, how a single-threaded runtime serves thousands of connections, what Node is good and bad at, the globals it provides, and how it differs from the browser.
---

## Node.js in one sentence

> "**Node.js** is a JavaScript **runtime** built on Chrome's **V8 engine** and a C library called **libuv**, that lets you run JavaScript **outside the browser**, mainly for servers, tools and scripts."

```viz algo=arch title="The layers of Node.js"
app Your JavaScript code [file]
api Node core modules (fs, http, net, crypto, stream...) [service]
bind C++ bindings [gateway]
v8 V8 engine (runs JS, JIT, GC) [fn]
uv libuv (event loop, thread pool, async I/O) [worker]
os Operating system (sockets, files, timers) [server]
app -> api : require / import
api -> bind : calls
bind -> v8 : runs JS
bind -> uv : async work
uv -> os : epoll / kqueue / IOCP
```

| Part | Job |
|---|---|
| **V8** | Parses and runs your JavaScript (bytecode, JIT), manages the heap and GC |
| **libuv** | The **event loop**, the **thread pool** (default 4 threads) and cross-platform async I/O (files, DNS, TCP, timers) |
| **Node core modules** | JavaScript APIs: `fs`, `http`, `net`, `stream`, `crypto`, `os`, `path`, `events`, `worker_threads`... |
| **C++ bindings** | Glue between JavaScript and the C/C++ libraries (OpenSSL, zlib, llhttp, c-ares) |
| **npm** | The package manager and registry (the biggest ecosystem) |

## The event-driven, non-blocking model

A traditional server (older Apache or PHP) used **one thread per request**. 10,000 connections means 10,000 threads: lots of memory and context switching. Node uses **one thread for your code** and **asynchronous I/O**:

```viz algo=eventloop title="One thread serving many requests"
step | stack: main | note: A request arrives. Node runs the handler on the single JavaScript thread.
step | stack: handler(req1), db.query(...) | note: The handler asks the database for data. This is an async call.
step | stack: - | apis: db query 1 (waiting) | note: The query is handed to the OS/driver. The thread is **free** again.
step | stack: handler(req2), db.query(...) | apis: db query 1 | note: Request 2 arrives and is started while query 1 is still running.
step | stack: - | apis: db query 1, db query 2 | note: Both queries wait **in parallel**, outside the JavaScript thread.
step | stack: - | apis: db query 2 | macro: callback(req1) | note: Query 1 finishes first: its callback goes to the queue.
step | stack: callback(req1), res.send() | apis: db query 2 | macro: - | print: response 1 | note: The thread runs it and sends response 1.
step | stack: callback(req2), res.send() | apis: - | print: response 2 | note: Then response 2. One thread handled both requests.
```

This is why Node is great when most of the time is **waiting** (network, database, files). It is a poor fit when most of the time is **computing** (video encoding, ML, heavy maths), unless you use **worker threads** or another service.

| Node is good for | Node is not ideal for |
|---|---|
| REST/GraphQL APIs, BFFs, WebSockets, real-time apps (chat, live data) | CPU-heavy computation on the main thread |
| Streaming (video, uploads, proxies), microservices | Long synchronous jobs (blocks every request) |
| CLIs, build tools, scripts, serverless functions | Very large mutable shared state in one process |
| Server-side rendering (React, Next.js) | |
| One language (JS/TS) for front and back end | |

## Globals in Node

```js run node title="What Node gives you (and what it does not)"
console.log(typeof process, typeof global, typeof globalThis, typeof Buffer, typeof require);
console.log(typeof setImmediate, typeof queueMicrotask, typeof structuredClone, typeof fetch, typeof AbortController);
console.log(typeof window, typeof document, typeof localStorage, typeof alert);
console.log(process.version.startsWith("v"), process.platform.length > 0, typeof process.pid);
```

| In Node | Not in Node (browser only) |
|---|---|
| `process`, `Buffer`, `require`, `module`, `__dirname`, `__filename` (CommonJS), `setImmediate`, `global` | `window`, `document`, `localStorage`, `alert`, the DOM |
| `fetch`, `URL`, `TextEncoder`, `AbortController`, `structuredClone`, `performance`, `crypto` (Web Crypto), `EventTarget` (modern Node) | `requestAnimationFrame`, `XMLHttpRequest` (use `fetch`/`http`) |

## Your first server

```js run node title="An HTTP server in 10 lines (it starts, answers one request, then stops)"
const http = require("node:http");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ method: req.method, url: req.url, message: "hello from Node" }));
});

server.listen(0, async () => {                                    // port 0: let the OS pick a free port
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/greet?name=Asha`);
  console.log(response.status, await response.json());
  server.close();
});
```

## Versions and LTS

- Node releases a new major version every 6 months. **Even-numbered** versions (20, 22, 24) become **LTS** (Long Term Support) in the autumn, with about 30 months of fixes. Use **LTS** in production.
- Manage versions with **nvm**, **fnm** or **Volta**. Pin the version in `package.json` (`"engines"`) and `.nvmrc`.
- Related runtimes: **Deno** and **Bun** (also JavaScript/TypeScript runtimes, with different designs and built-in tooling).

## package.json essentials

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.js",
  "scripts": { "start": "node src/index.js", "test": "node --test" },
  "dependencies": { "express": "^4.19.0" },
  "devDependencies": { "eslint": "^9.0.0" },
  "engines": { "node": ">=20" }
}
```

- **`dependencies`** are needed to run; **`devDependencies`** only for development/build.
- **Semver:** `^4.19.0` allows 4.x.x updates (no breaking changes); `~4.19.0` allows patch updates only. **`package-lock.json`** pins the exact versions: commit it.
- **`"type": "module"`** makes `.js` files ES modules (default: CommonJS).

:::interview What is Node.js and how does it handle many connections with one thread?
"Node.js is a JavaScript runtime made of the V8 engine, libuv and C++ bindings with core modules. My JavaScript runs on a single thread, but I/O is asynchronous: when I start a database query or a socket read, Node hands it to the OS or the libuv thread pool and continues; when it completes, a callback is queued and the event loop runs it. So one thread can interleave thousands of connections as long as handlers do not block with CPU-heavy or synchronous work. For CPU-bound jobs I use worker threads, child processes or a queue and separate service."
:::

## More interview questions on this topic

:::qa What are the main components of Node.js? {level=easy}
**Say this:** "V8 for running JavaScript, libuv for the event loop, thread pool and async I/O, C++ bindings, and the core modules like fs, http and crypto."

**In simple words:** Engine, event loop with helpers, and a library of tools.
:::

:::qa Is Node.js single-threaded? {level=medium}
**Say this:** "Your JavaScript runs on one thread (the main thread with the event loop), but Node itself uses more threads: the libuv thread pool (default 4) for file system, DNS lookups, crypto and zlib, V8 helper threads for GC and compilation, and optional worker threads."

**In simple words:** One thread for your code, other threads doing the heavy waiting behind the scenes.
:::

:::qa When would you NOT choose Node.js? {level=medium}
**Say this:** "For CPU-intensive workloads where the work cannot be moved off the main thread, such as video transcoding or heavy numerical computing, and when strict multi-threaded shared-memory computation is the core of the system."

**In simple words:** When the job is "think hard", not "wait for things".
:::

:::qa What is the difference between `dependencies` and `devDependencies`? {level=easy}
**Say this:** "`dependencies` are required at runtime. `devDependencies` are only needed for development, such as tests, linters and build tools, and are skipped with `npm install --omit=dev` in production."

**In simple words:** What the app needs to run vs what the developer needs to build it.
:::

```quiz
? Which component provides Node's event loop and thread pool?
- V8
+ libuv
- npm
> libuv handles async I/O.
? Why is Node good at handling many connections?
- It uses a thread per connection
+ I/O is non-blocking, so one thread interleaves many requests
- It has a fast GC
> The thread is not blocked while waiting.
? Which Node release lines get LTS?
- All of them
+ Even-numbered versions
- Only 0.x
> Use LTS for production.
```

:::keypoints
- **Node = V8 + libuv + C++ bindings + core modules** (+ npm).
- **One JS thread, async I/O**, a libuv **thread pool** (4) for fs/DNS/crypto/zlib. Great for I/O-bound work, bad for CPU-bound work.
- Node has `process`, `Buffer`, `require`, `setImmediate`...; no `window` or DOM. Modern Node has `fetch`, `AbortController`, `structuredClone`.
- Use **LTS**, lock versions with `package-lock.json`, `"type": "module"` for ESM.
:::
