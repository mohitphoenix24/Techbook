---
title: "LLD interview: which pattern would you use?"
level: medium
time: 35
summary: Thirty scenario questions where you must name the pattern (or patterns) and justify it: from notification systems and undo to payment methods, plugin systems, caches and rule engines.
---

Interviewers often describe a situation and ask "what pattern fits?". The best answers name the pattern, the **variation point** it addresses, and one trade-off.

:::qa A payment system must support cards, UPI, wallets and new methods later without editing the checkout code. {level=easy}
**Strategy** (`PaymentMethod` interface with `pay(amount)`), created through a **Factory**. Checkout depends on the interface only (OCP, DIP).
:::

:::qa An app must notify users by email, SMS and push, and new channels are added often. {level=easy}
**Strategy** for each channel, plus **Factory/registry** to pick channels by user preference, and **Chain of Responsibility** or **Decorator** if you need retries, rate limiting or fallbacks. Use **Observer** to trigger notifications from domain events.
:::

:::qa A text editor needs undo/redo. {level=easy}
**Command** with an undo/redo stack; **Memento** if actions are easier to reverse by restoring a snapshot.
:::

:::qa Objects need to react when a stock price changes. {level=easy}
**Observer** (publisher/subscribers). In multithreaded code notify outside the lock and use `weak_ptr` for subscribers.
:::

:::qa A vending machine / ATM / traffic light with distinct modes. {level=easy}
**State** (or a table-driven state machine). Each state object handles events and returns the next state.
:::

:::qa A pricing engine with different discounts that can be combined. {level=medium}
**Strategy** for each discount rule, combined with **Decorator** (stacked discounts) or **Chain of Responsibility** (apply rules in order), or **Specification** for eligibility conditions.
:::

:::qa File system with folders and files, each with size() and delete(). {level=easy}
**Composite**. Add **Visitor** for operations like search or total size if the set of operations grows.
:::

:::qa Add logging, caching and authorisation around a service without changing it. {level=medium}
**Proxy** (caching, protection) or **Decorator** (stackable cross-cutting behaviours). Use Proxy when controlling access to a single subject; Decorator when composing optional behaviours.
:::

:::qa A legacy library has a different interface from what your code expects. {level=easy}
**Adapter** (object adapter wrapping the legacy class).
:::

:::qa A complicated subsystem (booking, payment, notification) needs one simple entry point. {level=easy}
**Facade** (`BookingService::book(...)` orchestrates the subsystems).
:::

:::qa A request must pass through validation, authentication, rate limiting and then the handler. {level=easy}
**Chain of Responsibility** (middleware pipeline); each step may reject or pass on.
:::

:::qa A report generator has the same steps (fetch, transform, render) but different formats. {level=easy}
**Template Method** if the steps are fixed and subclasses vary the details; **Strategy** for the renderer if it must change at run time.
:::

:::qa A game has many characters whose behaviour (AI) must be swapped at run time. {level=medium}
**Strategy** for AI behaviours, **State** for modes (patrol, chase), **Flyweight** for shared assets, and optionally an **Entity-Component** design instead of deep inheritance.
:::

:::qa A GUI toolkit must support Windows and Mac widgets that look consistent. {level=medium}
**Abstract Factory** (one factory per platform creating matching widgets), with **Bridge** if abstraction and platform vary separately.
:::

:::qa An object with 15 optional configuration parameters. {level=easy}
**Builder** (fluent API, validation in `build()`), or a config struct with defaults.
:::

:::qa Creating copies of complex pre-configured objects (game units, documents). {level=medium}
**Prototype** with a virtual `clone()`, optionally with a registry of prototypes.
:::

:::qa A single shared logger/configuration for the app. {level=easy}
**Singleton** if it is truly global and immutable after startup; better, create one instance in `main` and pass it in (**dependency injection**). A **Null Object** logger helps in tests.
:::

:::qa Expensive objects (database connections, threads) are created too often. {level=medium}
**Object Pool** (with RAII handles), or **Flyweight** if the objects are immutable and shareable.
:::

:::qa A tree-structured expression `(a + b) * c` must be evaluated and also printed. {level=medium}
**Composite** for the tree, **Interpreter** for evaluation, **Visitor** to add printing/simplification without editing nodes (or `std::variant` + `std::visit`).
:::

:::qa A search page with many filters that can be combined with AND/OR/NOT. {level=medium}
**Specification** (composable predicates) or **Interpreter**, built with a **Builder** for the query.
:::

:::qa Many UI components talk to each other in tangled ways. {level=medium}
**Mediator** (one coordinator, e.g. a dialog controller) or an **event bus** (Observer) to decouple them.
:::

:::qa A workflow where each task starts only after its dependencies finish. {level=hard}
A **DAG** with topological ordering; each task is a **Command**; use **Observer** for status events and **State** for each task's lifecycle.
:::

:::qa A cache that must evict least-recently used items and be pluggable (LRU, LFU, FIFO). {level=medium}
**Strategy** for the eviction policy, **Decorator**/**Proxy** to add the cache in front of a data source, and **Singleton/DI** for sharing. Data structures: hash map + doubly linked list.
:::

:::qa A document that can be exported to PDF, HTML and Markdown, and new exports appear regularly. {level=medium}
**Visitor** (if the document node types are stable) or **Strategy** per exporter (simpler when the document structure is small).
:::

:::qa Objects that must be created differently per environment (test vs production). {level=medium}
**Abstract Factory** or DI container/composition root choosing implementations; **Null Object** or **Fake** for tests.
:::

:::qa A "do nothing" behaviour avoids null checks in a plugin system. {level=easy}
**Null Object**.
:::

:::qa A plug-in architecture where modules register themselves at startup. {level=hard}
A **registry** (factory with self-registration), **Strategy**/interfaces for the plugin contract, **Observer** for lifecycle events. Mention versioning and ABI concerns if plugins are shared libraries.
:::

:::qa An order that moves through Created → Paid → Shipped → Delivered, with different allowed actions per step. {level=easy}
**State** (or table-driven machine); **Observer** for events like "order shipped" that trigger emails.
:::

:::qa A rate limiter with token bucket and sliding window variants. {level=medium}
**Strategy** (the algorithm) behind a `RateLimiter` interface, a **Factory** to select by config, and **Decorator** to add metrics.
:::

:::qa A system that processes jobs on a schedule with retries and priorities. {level=medium}
**Command** (each job), priority queue plus worker pool, **Strategy** for retry/backoff policy, **State** for job status, **Observer** for completion events.
:::

```quiz
? You need to add new operations (print, evaluate, optimise) to a stable set of AST node classes without editing the nodes. Which pattern?
- Decorator
+ Visitor
- Bridge
> Double dispatch adds operations from outside.
```

:::keypoints
- Name the variation point first (algorithm, state, event, request, structure, creation), then the pattern.
- Combine patterns sensibly: Strategy+Factory, Command+Memento, Composite+Visitor, Observer+Mediator.
- Mention a trade-off and a simpler alternative (lambda, enum, plain function).
:::
