---
title: "Resources and reading list"
level: easy
time: 10
summary: Checked links to the best free references for JavaScript, Node, browsers, security and React, plus books, talks and tools that help you practise.
---

All links below were opened and checked when this page was written. Pages change, so if one moves, search for its title.

## The language

| Resource | Why |
|---|---|
| [MDN: JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript) | The reference for every API. Read the guide and the reference together. |
| [javascript.info](https://javascript.info/) | A modern, step-by-step tutorial with exercises. |
| [ECMAScript specification](https://tc39.es/ecma262/) | The final answer when two articles disagree. Look up "Abstract Equality Comparison" once. |
| [TC39 proposals](https://github.com/tc39/proposals) | What is coming next and its stage. |
| [You Don't Know JS Yet](https://github.com/getify/You-Dont-Know-JS) | Free books on scope, closures, `this`, prototypes, async. |
| [Eloquent JavaScript](https://eloquentjavascript.net/) | A free book, good for fundamentals and exercises. |
| [Exploring JS](https://exploringjs.com/) | Deep, accurate books by Axel Rauschmayer, free to read online. |
| [33 JavaScript concepts](https://github.com/leonardomso/33-js-concepts) | A checklist of concepts with links to explanations. |
| [Can I use](https://caniuse.com/) | Browser support for any feature. |

## Event loop and async

| Resource | Why |
|---|---|
| [MDN: JavaScript execution model](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model) | The official description of the stack, queues and run-to-completion. |
| [Tasks, microtasks, queues and schedules](https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/) | Jake Archibald's article with visual examples. |
| [Jake Archibald: In the Loop (talk)](https://www.youtube.com/watch?v=cCOL7MC4Pl0) | The best talk on the browser event loop, including rendering. |
| [Philip Roberts: What the heck is the event loop anyway? (talk)](https://www.youtube.com/watch?v=8aGhZQkoFbQ) | A gentle introduction with animations. |
| [MDN: AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) | Cancellation, used by `fetch`, streams and your own code. |

## Node.js

| Resource | Why |
|---|---|
| [Node.js API documentation](https://nodejs.org/docs/latest/api/) | The reference for `fs`, `stream`, `http`, `worker_threads` and more. |
| [Node: The event loop, timers and nextTick](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick) | The official explanation of the phases. |
| [Node: Introduction to Node.js](https://nodejs.org/en/learn/getting-started/introduction-to-nodejs) | The starting point of the official learning guides. |
| [Node.js best practices](https://github.com/goldbergyoni/nodebestpractices) | A long, well-organised list of production habits. |
| [Node.js Design Patterns](https://www.nodejsdesignpatterns.com/) | A book on streams, async patterns and scalable design. |

## Browser, performance and security

| Resource | Why |
|---|---|
| [web.dev: Core Web Vitals](https://web.dev/articles/vitals) | What LCP, INP and CLS measure and how to improve them. |
| [web.dev: Rendering performance](https://web.dev/articles/rendering-performance) | Layout, paint and compositing, with practical advice. |
| [V8 blog](https://v8.dev/blog) | How the engine works: garbage collection, optimisation, new features. |
| [OWASP Top 10](https://owasp.org/www-project-top-ten/) | The standard list of web application risks. |
| [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/) | Short, practical guides on XSS, CSRF, sessions, JWT and more. |

## React and design patterns

| Resource | Why |
|---|---|
| [React documentation](https://react.dev/) | Learn, reference and "Thinking in React". |
| [You might not need an effect](https://react.dev/learn/you-might-not-need-an-effect) | Fixes the most common misuse of `useEffect`. |
| [patterns.dev](https://www.patterns.dev/) | JavaScript, React and rendering patterns with diagrams. |
| [TypeScript documentation](https://www.typescriptlang.org/docs/) | Most senior roles expect TypeScript too. |

## Tools for practice

- **Your browser's DevTools**: Performance, Memory (heap snapshots), Network, Application (storage, service workers).
- **Node's own tools**: `node --inspect`, `node --cpu-prof`, `node --test`.
- **This course's editor**: change any example and run it. Predict first.

:::keypoints
- Use **MDN** for facts, the **spec** for arguments, and **talks** for the event loop.
- Read the **official Node docs** for the event loop and streams; read **OWASP** for security.
- Learning by **running and changing code** beats reading twice.
:::
