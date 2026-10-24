---
title: "LLD interview: which pattern would you use?"
level: medium
time: 35
summary: Thirty situations where you must name the pattern (or patterns) and say why: notifications, undo, payment methods, plug-ins, caches, rules, and more.
---

Interviewers often describe a situation and ask "which pattern fits?". A good answer has three parts: **the pattern**, **what changes** (the reason), and **one trade-off**.

A trick: first ask "what can change here?" (a way of doing a job, a state, a type to create, a list of handlers). The answer points to the pattern.

:::qa A payment system must support cards, UPI, wallets and new methods later, without editing the checkout code. {level=easy}
**Say this:** "Strategy. A `PaymentMethod` interface with `pay(amount)`, and a Factory to pick one. Checkout uses only the interface."
:::

:::qa An app must notify users by email, SMS and push, and new channels are added often. {level=easy}
**Say this:** "Strategy for each channel, and a factory or registry to pick channels from user settings. Add Chain of Responsibility or Decorator for retry and rate limits, and Observer to start notifications from events."
:::

:::qa A text editor needs undo/redo. {level=easy}
**Say this:** "Command, with an undo stack and a redo stack. Memento if it is easier to restore a snapshot."
:::

:::qa Objects need to react when a stock price changes. {level=easy}
**Say this:** "Observer. In many threads, notify outside the lock and hold subscribers by `weak_ptr`."
:::

:::qa A vending machine / ATM / traffic light has different modes. {level=easy}
**Say this:** "State (or a table of transitions). Each state decides what an event does and what comes next."
:::

:::qa A pricing engine has different discounts that can be combined. {level=medium}
**Say this:** "Strategy for each discount. Combine them with Decorator (stack) or Chain of Responsibility (in order). Specification for the 'who qualifies' rules."
:::

:::qa A file system with folders and files, each with size() and delete(). {level=easy}
**Say this:** "Composite. Add Visitor if many new jobs (search, total size) will come."
:::

:::qa Add logging, caching and permission checks around a service without changing it. {level=medium}
**Say this:** "Proxy for caching and permission checks, or Decorator for stackable extras like logging. Proxy controls access. Decorator adds features."
:::

:::qa A legacy library has a different interface from what your code expects. {level=easy}
**Say this:** "Adapter, as an object adapter that wraps the legacy class."
:::

:::qa A complicated group of parts (booking, payment, notification) needs one simple entry point. {level=easy}
**Say this:** "Facade, like `BookingService::book(...)` that calls the parts in order."
:::

:::qa A request must pass validation, login check, rate limit, and then the real handler. {level=easy}
**Say this:** "Chain of Responsibility (a middleware line). Each step can reject or pass on."
:::

:::qa A report has the same steps (fetch, transform, render) but different formats. {level=easy}
**Say this:** "Template Method if the steps are fixed and children change details. Strategy for the renderer if it must change while running."
:::

:::qa A game has many characters whose behaviour must be swapped while running. {level=medium}
**Say this:** "Strategy for behaviours, State for modes (patrol, chase), Flyweight for shared pictures, and maybe an Entity-Component design instead of deep inheritance."
:::

:::qa A GUI toolkit must support Windows and Mac widgets that look consistent. {level=medium}
**Say this:** "Abstract Factory: one factory for each platform that makes matching widgets. Add Bridge if the shape and the platform change separately."
:::

:::qa An object has 15 optional settings. {level=easy}
**Say this:** "Builder, with a fluent style and a check in `build()`. Or a config struct with default values."
:::

:::qa You need copies of complex pre-set objects (game units, documents). {level=medium}
**Say this:** "Prototype, with a virtual `clone()`, and maybe a catalogue of ready objects."
:::

:::qa A single shared logger or configuration for the app. {level=easy}
**Say this:** "Singleton if it is truly global and fixed after start. Better: create one in `main` and pass it in (dependency injection). A Null Object logger is useful in tests."
:::

:::qa Costly objects (database connections, threads) are created too often. {level=medium}
**Say this:** "Object Pool with an RAII handle. Or Flyweight if the objects never change and can be shared."
:::

:::qa A tree-shaped expression `(a + b) * c` must be evaluated and also printed. {level=medium}
**Say this:** "Composite for the tree, Interpreter for evaluation, and Visitor to add printing without editing nodes (or `std::variant` with `std::visit`)."
:::

:::qa A search page with many filters that can be joined with AND/OR/NOT. {level=medium}
**Say this:** "Specification (rules that you can combine), or Interpreter. A Builder can build the query."
:::

:::qa Many UI components talk to each other in a tangled way. {level=medium}
**Say this:** "Mediator (one coordinator, like a dialog controller), or an event bus (Observer) to separate them."
:::

:::qa A workflow where each task starts only after its dependencies finish. {level=hard}
**Say this:** "A DAG with topological order. Each task is a Command. Observer for status events and State for each task's life cycle."
:::

:::qa A cache that removes the least recently used items, with LRU, LFU or FIFO as options. {level=medium}
**Say this:** "Strategy for the removal rule. Decorator or Proxy to put the cache in front of a data source. Data structures: hash map and doubly linked list."
:::

:::qa A document that must export to PDF, HTML and Markdown, with new formats often. {level=medium}
**Say this:** "Visitor if the document's node types are stable. Otherwise a Strategy for each exporter, which is simpler."
:::

:::qa Objects must be created differently in test and production. {level=medium}
**Say this:** "Abstract Factory, or a composition root that picks the implementations. Null Object or fakes for tests."
:::

:::qa A "do nothing" behaviour avoids null checks in a plug-in system. {level=easy}
**Say this:** "Null Object."
:::

:::qa A plug-in system where modules register themselves at start-up. {level=hard}
**Say this:** "A registry (a factory where types register themselves), interfaces as the plug-in contract, and Observer for life-cycle events. Mention versions and compatibility if plug-ins are shared libraries."
:::

:::qa An order moves through Created, Paid, Shipped, Delivered, with different allowed actions at each step. {level=easy}
**Say this:** "State (or a table of transitions), and Observer for events like 'shipped' that send emails."
:::

:::qa A rate limiter with token bucket and sliding window versions. {level=medium}
**Say this:** "Strategy for the algorithm behind a `RateLimiter` interface, a Factory to choose by config, and Decorator to add metrics."
:::

:::qa A system that runs jobs on a schedule, with retries and priorities. {level=medium}
**Say this:** "Command for each job, a priority queue and worker pool, Strategy for the retry rule, State for job status, Observer for completion events."
:::

```quiz
? You need to add new jobs (print, evaluate, optimise) to a stable set of syntax-tree node classes without editing the nodes. Which pattern?
- Decorator
+ Visitor
- Bridge
> Double dispatch adds jobs from outside.
```

:::keypoints
- Name what can change first (a way of doing a job, a state, an event, a request, a structure, how things are created), then the pattern.
- Patterns work well together: Strategy with Factory, Command with Memento, Composite with Visitor, Observer with Mediator.
- Say one trade-off, and a simpler option (a lambda, an enum, a plain function).
:::
