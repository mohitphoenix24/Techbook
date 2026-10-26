# JSLab: JavaScript mastery for senior interviews

One place to prepare for senior full-stack JavaScript interviews. It teaches the language from the inside (execution model, scope, closures, `this`, prototypes, classes, the event loop, promises and async/await, objects, types, modern JavaScript, memory), then Node.js (event loop phases, streams, modules, production habits), the browser (DOM, events, rendering, caching, CORS), web security, and React's JavaScript internals. After the lessons come 45 coding challenges (implement debounce, Promise, a virtual DOM, a `require()` loader, a worker pool and more) and six topic-wise interview banks with short answers, output puzzles, find-the-bug drills and a rapid-fire round. The roadmap and the "15 priorities for next week" are mapped to the lessons.

## Open it

Open the site from the repo root (`../index.html`) and pick JSLab, or serve the repo root:

```bash
python3 -m http.server 8000      # then open http://localhost:8000/javascript/
```

## How the pages work

- ` ```js run ` examples show the output that real **Node.js 22** printed when the course was built. Edit one and press **Run**: the changed code runs live in your browser (in a Web Worker with a Node-style `console`, `require` shims for `events`, `util`, `assert`, `path`, `stream`, `buffer` and `timers/promises`). Examples that need real Node (worker threads, HTTP servers, file streams) are marked `node` and show the recorded output.
- ` ```html run ` examples run in a sandboxed frame so you can try the DOM, events and the browser APIs, with the console forwarded to the output panel.
- ` ```viz ` blocks are interactive diagrams: the event loop stepper (call stack, microtask and macrotask queues), promise chains and timelines.
- `:::problem` cards feed the **Problems** tracker (Basic / Intermediate / Advanced). `:::qa` boxes feed the **Q&A bank** page, grouped by topic with search, a level filter and a "known" tracker saved in your browser.

## Build and test

```bash
python3 build.py                       # bundles the lessons, runs every JS example with Node and checks the output is stable
python3 tools/outputs.py event-loop    # prints the verified output of the lessons whose path matches (to check the prose against it)
python3 -m http.server 8766            # from the repo root, then:
python3 javascript/tools/browser_test.py all --live      # Playwright: opens every lesson, runs examples in the browser and compares them with the Node output
```

The build needs Node.js 22 (`node` on the path). Examples that must fail (`expect-error`) or depend on timing (`timing`, `nondet`) are handled explicitly; everything else must print the same output on two runs.

## What's inside

| Module | Lessons |
|---|---|
| 1. Start Here | Welcome, and how to use this course; How senior JavaScript interviews work |
| 2. The Execution Model | How JavaScript runs your code; Execution context; The call stack; var, let and const; Hoisting; The temporal dead zone; Scope, shadowing and the scope chain; Lexical environments, the engine's view of scope; Strict mode, the global object and accidental globals |
| 3. Closures | What is a closure?; Private state, factories and the module pattern; Closures in loops; Closures with timers, callbacks and promises; Closures in React: stale state explained; Closures and memory; Useful closure patterns; Closure output puzzles |
| 4. The this keyword | What is this? The four rules; Method calls and the "lost this" problem; call, apply and bind; The new keyword and constructor functions; Arrow functions and lexical this; this in classes, callbacks, promises and the DOM; this output puzzles |
| 5. Prototypes and inheritance | Property lookup and the prototype chain; prototype vs __proto__ vs [[Prototype]]; Constructor functions and shared methods; Object.create and prototypal inheritance; What class really is; extends and super: how inheritance is wired; Prototype pitfalls and prototype pollution; Prototype output puzzles |
| 6. Classes and OOP in JavaScript | Class syntax: fields, accessors and static members; Private members and encapsulation; The four pillars of OOP in JavaScript; Composition vs inheritance; Design patterns in JavaScript; Class and OOP output puzzles |
| 7. Functions and functional programming | Functions are first-class values; Function forms and parameters; Callbacks, callback hell and inversion of control; Function composition and pipe; Currying and partial application; Pure functions, side effects and immutability; Recursion, memoized recursion and trampolines; Function output puzzles |
| 8. Arrays and functional patterns | map, filter, reduce and forEach; reduce in depth: grouping, counting, pipelines; find, some, every, flat, flatMap and sort; Array pitfalls and performance; Functional programming ideas; Array output puzzles |
| 9. The Event Loop | Synchronous vs asynchronous code; The event loop explained, step by step; Microtasks vs macrotasks; Timers in depth: setTimeout, setInterval and friends; Blocking the event loop: chunking and yielding; Event loop output puzzles |
| 10. Promises and async/await | Promises: states, creation and consumption; Promise chaining and error propagation; Promise.all, allSettled, race and any; Sequential vs parallel async work; async/await: how it really works; Error handling in async code; Concurrency control: pools, queues and semaphores; Timeouts, retries and cancellation (AbortController); Async iterators, for await and async generators; Ten common async mistakes; Promise and async/await puzzles |
| 11. Objects and the property system | Objects: keys, order and the Object static methods; Property descriptors: writable, enumerable, configurable; Object.freeze, seal and preventExtensions; Destructuring, spread and rest; Optional chaining, nullish coalescing and logical assignment; Object output puzzles |
| 12. Types, equality, coercion and copying | Types, typeof and reliable type checks; Numbers, floating point and BigInt; ==, === and Object.is; Type coercion and ToPrimitive; Shallow copy vs deep copy; JSON, Date and string pitfalls; Coercion, equality and type puzzles |
| 13. Modern JavaScript features | ES modules: import, export and how they differ from CommonJS; Iterators and iterables; Generators; Symbols and well-known symbols; Map, Set, WeakMap, WeakSet and WeakRef; Proxy and Reflect; A tour of modern JavaScript (ES2015 to ES2025); Generators, iterators, Map/Set and Proxy puzzles |
| 14. Memory and performance | How JavaScript uses memory: stack and heap; Garbage collection in V8; Memory leaks: causes, detection and fixes; Debounce; Throttle; Memoization; How V8 makes JavaScript fast (and how to avoid slowing it down); Web Workers and Node worker threads |
| 15. Node.js runtime and modules | What Node.js is made of; The Node.js event loop: phases; process.nextTick, setImmediate and microtasks; The libuv thread pool, and what blocks Node; CommonJS modules: require, module.exports and caching; ES modules in Node.js, and CommonJS interop; EventEmitter and the core modules you must know; process, environment variables, signals and CLIs; Node.js event loop and module puzzles |
| 16. Buffers and streams | Buffers: working with binary data; Streams: why they exist and how to read them; Backpressure, pipe and pipeline; Writing your own streams: Readable, Writable, Transform; Streams in practice: HTTP, uploads, web streams and a memory test |
| 17. Node.js in production | Error handling in Node.js; Middleware, routing and error middleware (build a mini Express); Graceful shutdown, health checks and zero-downtime deploys; child_process, cluster and scaling Node across CPU cores; Node.js performance: measuring, profiling and fixing; Testing Node.js code, and a production checklist |
| 18. Browser fundamentals | The DOM and the BOM; DOM events: capturing, bubbling, delegation; How the browser renders a page, and how to keep it fast; Cookies, localStorage, sessionStorage and IndexedDB; fetch, the same-origin policy and CORS; HTTP caching and Service Workers; Browser output puzzles: events, DOM and timing |
| 19. Web and JavaScript security | Cross-site scripting (XSS) and Content Security Policy; CSRF, clickjacking and cross-site request protection; Sessions vs JWT: authentication done right; Prototype pollution: how it is exploited and how to stop it; Injection attacks and input validation; Dependencies, secrets, security headers and rate limiting |
| 20. The JavaScript behind React | How React renders: elements, the virtual DOM and reconciliation; State, snapshots and why components re-render; How hooks work (build useState, useEffect, useMemo and useRef); useEffect in depth: dependencies, cleanup, races and when not to use it; useMemo, useCallback, React.memo and referential equality; Refs, context, controlled inputs and composition patterns; Concurrent React, Suspense, SSR, hydration and Server Components; React output puzzles |
| 21. Coding challenges: Basic | Implement debounce; Implement throttle; Implement once and memoize; Implement curry and partial; Implement compose and pipe; Implement flatten; Implement deep clone; Implement deep equal; Implement array methods (map, filter, reduce); Implement call, apply and bind; Implement new, instanceof and Object.create; Implement sleep, timeout and retry; Implement lodash-style utilities; Implement an EventEmitter; Implement string helpers |
| 22. Coding challenges: Intermediate | Implement Promise.all, allSettled, race and any; Implement a Promise class; Implement an async pool (concurrency limit); Implement promisify and callbackify; Implement an LRU cache; Implement a TTL cache and async memoization; Implement a rate limiter; Implement a Redux-style store and observable; Implement reactivity with Proxy (mini Vue); Implement deep merge, diff and patch; Implement JSON.stringify and JSON.parse; Implement a template engine; Implement a query-string parser and a route matcher; Implement a task scheduler with dependencies; Implement a middleware pipeline (Koa and Express style); Implement event delegation and a DOM helper |
| 23. Coding challenges: Advanced | Implement a virtual DOM and diff; Implement an async iterator pipeline; Implement Node stream transforms and respect backpressure; Implement cancellation with AbortSignal; Implement an Immer-style produce; Fix race conditions (takeLatest, mutex, single-flight); Implement undo and redo (snapshots and commands); Implement list windowing (virtual scrolling maths); Implement autocomplete with a trie; Implement a text diff (LCS and Myers); Implement a schema validator (mini Zod); Implement a plugin system with hooks (mini tapable); Implement require() (a CommonJS module loader); Implement a worker thread pool |
| 24. Interview Bank: Core JavaScript | Core bank: execution, scope and hoisting; Core bank: closures; Core bank: this, call, apply and bind; Core bank: prototypes and classes; Core bank: functions and functional programming; Core bank: types, equality, copying and objects; Core bank: modern JavaScript (ES6 and later); Core bank: cheat sheet |
| 25. Interview Bank: Async JavaScript | Async bank: the event loop; Async bank: promises; Async bank: async/await and patterns; Async bank: cheat sheet |
| 26. Interview Bank: Advanced JavaScript | Advanced bank: memory and performance; Advanced bank: iterators, generators and symbols; Advanced bank: Proxy, Reflect and metaprogramming; Advanced bank: error handling; Advanced bank: design patterns and architecture in JavaScript; Advanced bank: frontend system design questions |
| 27. Interview Bank: Node.js | Node bank: runtime, event loop and modules; Node bank: streams and buffers; Node bank: Express and API design; Node bank: process, errors and graceful shutdown; Node bank: scaling, performance and security; Node bank: cheat sheet |
| 28. Interview Bank: Web, Security and React | Web bank: the DOM and events; Web bank: rendering, loading, caching and storage; Web bank: security; Web bank: React internals; Web bank: cheat sheet |
| 29. Interview Bank: Puzzles, Bugs and Rapid Fire | Puzzles: scope, closures and types; Puzzles: this, prototypes and classes; Puzzles: the order of async code; Find the bug; Rapid fire: 60 one-line answers |
| 30. Plan and Resources | Your roadmap and the 15 priorities; Study plans: 7, 14 and 30 days; How to answer senior questions; Resources and reading list |

Totals: **224 lessons**, **45 coding challenges** (15 Basic, 16 Intermediate, 14 Advanced), **951 interview questions** with answers, **126 quiz questions**, **994 runnable JavaScript examples** (each run with Node.js 22 when the course is built) and 22 browser (HTML) examples, with 45 interactive diagrams.
