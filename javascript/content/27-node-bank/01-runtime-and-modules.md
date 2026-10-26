---
title: "Node bank: runtime, event loop and modules"
level: medium
time: 30
summary: Thirteen answers on what Node is, V8 and libuv, the event loop phases, blocking versus non-blocking, the thread pool, CommonJS versus ES modules and the package.json fields that matter.
---

:::qa What is Node.js, and why is it good for I/O-heavy work? {level=easy}
**Say this:** "Node is a JavaScript runtime built on Chrome's V8 engine and the libuv library. It runs your JavaScript on one thread with an event loop and delegates I/O to the operating system or a thread pool, so one process can handle thousands of concurrent connections that mostly wait for I/O."

**In simple words:** One clever waiter serving many tables, because most of the time the customers are thinking, not eating.
:::

:::qa What do V8 and libuv each do? {level=medium}
**Say this:** "V8 compiles and runs JavaScript and manages the heap and garbage collection. libuv provides the event loop, asynchronous file, network and DNS operations, timers, and a thread pool for work that the OS cannot do asynchronously."

**In simple words:** V8 is the brain that reads your code; libuv is the hands that do I/O.
:::

:::qa Describe the phases of the Node event loop. {level=hard}
**Say this:** "Timers (`setTimeout`/`setInterval` callbacks), pending callbacks, idle/prepare, poll (retrieve new I/O events and run their callbacks), check (`setImmediate`), and close callbacks. Between callbacks Node runs the `process.nextTick` queue and then the promise microtask queue."

**In simple words:** A circular route with fixed stops; at each stop it handles the waiting callbacks, and after every callback it clears the small urgent tasks.
:::

:::qa What is the libuv thread pool, and which operations use it? {level=hard}
**Say this:** "A pool of worker threads (default 4, set with `UV_THREADPOOL_SIZE`) used for operations that have no async OS API: most `fs` calls, `dns.lookup`, `crypto.pbkdf2`/`scrypt`/`randomBytes`, and `zlib`. Network sockets use the OS's async mechanisms instead. If the pool is busy, these operations queue."

**In simple words:** Four extra helpers for slow jobs; if all four are busy, others wait.
:::

:::qa What does "blocking the event loop" mean? Give examples. {level=medium}
**Say this:** "Running long synchronous work on the main thread so no other request or callback can run. Examples: `fs.readFileSync` in a handler, a huge `JSON.parse`, a catastrophic regex, sync crypto, a big `for` loop. Move heavy work to worker threads, streams, or another service."

**In simple words:** One slow customer at the counter makes the whole queue wait.
:::

:::qa Is Node single-threaded? {level=medium}
**Say this:** "Your JavaScript runs on a single main thread, but Node itself uses other threads: the libuv pool, V8's garbage-collection threads, and optional `worker_threads` that you create. So 'single-threaded' describes the JavaScript execution, not the whole process."

**In simple words:** One cook in the kitchen, but there are helpers outside.
:::

:::qa CommonJS versus ES modules in Node? {level=medium}
**Say this:** "CommonJS uses `require` and `module.exports`, loads synchronously, and is the default for `.js` unless `"type": "module"`. ESM uses `import`/`export`, loads asynchronously, supports top-level `await`, has no `__dirname` (use `import.meta.url` / `import.meta.dirname`), and exports live bindings. ESM can import CJS easily; CJS must use dynamic `import()` for ESM (newer Node versions can `require` synchronous ESM)."

**In simple words:** Two systems for sharing code; ESM is the standard and the future.
:::

:::qa How does `require` resolve a module? {level=medium}
**Say this:** "Core modules first (`node:fs`), then relative or absolute paths (trying the file, `.js`, `.json`, `.node`, then a directory's `package.json` `main` or `index.js`), then `node_modules` folders from the current directory up to the root. Results are cached in `require.cache`."

**In simple words:** Look in Node's own toolbox, then in your files, then up the `node_modules` ladder.
:::

:::qa Why does `require` cache modules, and what does that mean for state? {level=medium}
**Say this:** "A module's code runs once, and later `require` calls return the same `exports` object. That makes modules natural singletons that share state (like a database connection), but also means state leaks between tests unless you reset the cache or avoid module-level state."

**In simple words:** The first visitor builds the room; everybody else gets the same room.
:::

:::qa Which `package.json` fields matter? {level=medium}
**Say this:** "`name`, `version`, `type` (module/commonjs), `main` and `exports` (entry points, with conditions for import/require), `scripts`, `dependencies`/`devDependencies`/`peerDependencies`, `engines`, and `bin`. The lock file (`package-lock.json`) pins exact versions for repeatable installs."

**In simple words:** The label and instructions of the package.
:::

:::qa `dependencies`, `devDependencies` and `peerDependencies`? {level=easy}
**Say this:** "`dependencies` are needed at run time. `devDependencies` only for development and build (tests, linters). `peerDependencies` say 'my host project must provide this package', common for plugins and React libraries."

**In simple words:** What the app needs, what the developers need, and what the host must bring.
:::

:::qa What is semantic versioning, and what do `^` and `~` mean? {level=easy}
**Say this:** "MAJOR.MINOR.PATCH: breaking changes, new features, bug fixes. `^1.2.3` allows updates that do not change the first non-zero number (1.x.x); `~1.2.3` allows only patch updates (1.2.x). Commit the lock file for repeatable builds."

**In simple words:** Caret allows safe-looking upgrades; tilde allows only small fixes.
:::

:::qa How do you read environment variables and configuration safely? {level=easy}
**Say this:** "`process.env.NAME` (always a string). Validate and convert at start-up with a schema, fail fast if something is missing, never commit secrets, and use a secrets manager in production. `.env` files with `dotenv` or `node --env-file` are for local development only."

**In simple words:** Read settings once at the start, check them, and stop early if something is missing.
:::

:::qa What are global objects in Node that differ from the browser? {level=easy}
**Say this:** "`process`, `Buffer`, `__dirname`/`__filename` (CJS only), `require` (CJS), `global` (now `globalThis`), and timers like `setImmediate`. There is no `window` or `document`. Modern Node also provides `fetch`, `URL`, `AbortController`, `structuredClone` and Web Streams."

**In simple words:** Different tools for a different place.
:::

:::keypoints
- Node = **V8 + libuv**; JavaScript on **one thread**, I/O delegated.
- Phases: **timers → poll → check → close**, with `nextTick` and microtasks in between.
- The **thread pool** (default 4) serves `fs`, `crypto`, `zlib`, `dns.lookup`.
- Never **block the loop**; heavy work goes to **workers**.
- Know **CJS vs ESM**, `require` resolution and caching, `package.json` fields, semver.
:::
