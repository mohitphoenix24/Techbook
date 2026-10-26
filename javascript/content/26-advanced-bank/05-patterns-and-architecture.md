---
title: "Advanced bank: design patterns and architecture in JavaScript"
level: hard
time: 25
summary: Twelve answers on patterns you really use, such as module, factory, singleton, observer, strategy, decorator, middleware and dependency injection, plus how to structure code in a senior way.
---

:::qa Which design patterns do you use most in JavaScript? {level=easy}
**Say this:** "Module (ES modules), factory functions, observer or pub/sub (events), strategy (passing a function), decorator and higher-order functions, middleware (a chain of handlers), adapter and facade around external APIs, and dependency injection for testability."

**In simple words:** Most patterns become 'pass a function' or 'return an object' in JavaScript.
:::

:::qa What is the module pattern, and how is it done today? {level=easy}
**Say this:** "Encapsulating private state and exposing a small public API. Before ES modules it was an IIFE returning an object. Now every file is a module: unexported variables are private, and exports are the public API."

**In simple words:** Keep the messy parts inside the file, show only what others need.
:::

:::qa Factory function or class? {level=medium}
**Say this:** "Factory functions return objects, give real privacy through closures, avoid `this` problems and `new`, and compose easily. Classes give a shared prototype (less memory for many instances), `instanceof` and a familiar syntax. I choose classes for many similar objects or when a framework expects them, and factories for small services and configuration."

**In simple words:** Factory: a function that builds objects. Class: a blueprint with a shared toolbox.
:::

:::qa How is a singleton done in JavaScript, and is it a good idea? {level=medium}
**Say this:** "An ES module is evaluated once and cached, so exporting one instance (`export const db = createDb()`) is a singleton. It is convenient but creates hidden global state that makes tests and parallel use harder; prefer passing the dependency in."

**In simple words:** One shared object for everybody. Easy to get, hard to test.
:::

:::qa Explain the observer pattern and how it differs from pub/sub. {level=medium}
**Say this:** "In observer, subjects keep a list of observers and notify them directly. In pub/sub, a broker (event bus) sits between publishers and subscribers, who do not know each other. `EventTarget`, `EventEmitter`, DOM events and Redux `subscribe` are examples."

**In simple words:** Observer: you call your friends directly. Pub/sub: you post on a notice board.
:::

:::qa What is the strategy pattern in JavaScript? {level=easy}
**Say this:** "Choose behaviour at run time by passing a function or an object of functions: a sort comparator, a validation rule, a pricing function, a retry policy. A `Map` or object of strategies replaces long `if/else` or `switch` chains."

**In simple words:** Hand the function the recipe to use.
:::

:::qa What is the decorator pattern, and how does it relate to higher-order functions? {level=medium}
**Say this:** "Wrapping a function or object to add behaviour without changing it: `withLogging(fn)`, `memoize(fn)`, `debounce(fn)`, `withAuth(handler)`. TypeScript and proposals have decorator syntax for classes, but function wrappers are the everyday form."

**In simple words:** Put a frame around the picture without repainting it.
:::

:::qa What is middleware, and where have you seen it? {level=medium}
**Say this:** "A chain of functions where each can act, change the request or response, and pass control to the next one. Express, Koa, Redux, axios interceptors and Next.js use it. It keeps cross-cutting concerns (logging, auth, compression, error handling) out of business code."

**In simple words:** A line of checkpoints each request goes through.
:::

:::qa What is dependency injection, and do you need a framework for it? {level=medium}
**Say this:** "Passing a function or class its dependencies (database, clock, HTTP client) instead of letting it create or import them. It makes code easy to test with fakes. In JavaScript a function parameter or a factory `createService({ db, clock })` is enough; containers like NestJS or InversifyJS help in large apps."

**In simple words:** Give the worker their tools instead of letting them go shopping.
:::

:::qa How do you structure a large JavaScript application? {level=medium}
**Say this:** "Organise by feature or domain, not by file type. Keep layers separate: UI, state, services (API access), domain logic. Make dependencies point inward, put side effects at the edges, keep pure logic in small testable functions, and agree on conventions with linting and TypeScript."

**In simple words:** Group things that change together, and keep decisions apart from details.
:::

:::qa What is the difference between imperative and declarative code? {level=easy}
**Say this:** "Imperative code says how, step by step (loops, mutations). Declarative code says what you want (`map`, `filter`, SQL, JSX, CSS). Declarative code is usually shorter and easier to reason about, while imperative code can be better for performance-critical parts."

**In simple words:** Tell the driver every turn, or just give the address.
:::

:::qa What is a state machine, and when would you use one? {level=medium}
**Say this:** "A model with a fixed set of states and allowed transitions (idle, loading, success, error). It removes impossible combinations like `loading && error`, makes flows such as checkout, uploads and forms predictable, and can be tested exhaustively. Libraries: XState, or a simple reducer."

**In simple words:** A board game: you can only move along the drawn arrows.
:::

:::qa What SOLID ideas apply to JavaScript? {level=hard}
**Say this:** "Single responsibility (small modules and functions), open/closed (extend by composition or passing functions rather than editing), dependency inversion (depend on parameters or interfaces, not concrete imports). Liskov and interface segregation matter mainly with classes and TypeScript types."

**In simple words:** Keep pieces small, replaceable and loosely connected.
:::

:::keypoints
- JS patterns are often just **functions and closures**: strategy, decorator, factory, DI.
- **Modules** are singletons; hidden global state hurts testing.
- **Observer/pub-sub** and **middleware** keep concerns separate.
- Structure by **feature**, keep **pure logic** apart from **side effects**; model flows as **state machines**.
:::
