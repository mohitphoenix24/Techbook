---
title: "LLD interview: behavioural patterns"
level: medium
time: 40
summary: Strategy, Observer, Command, State, Template Method, Chain of Responsibility, Iterator, Mediator, Memento, Visitor and Interpreter: intent, how to implement in C++, and the comparisons interviewers ask for.
---

:::qa What is the Strategy pattern? {level=easy}
Define a family of interchangeable algorithms behind an interface and let the context choose one at run time: `Cart` with `PricingStrategy` (`Regular`, `Festival`, `Bulk`). It replaces `if/else` on type and supports OCP. In C++ the strategy can also be a `std::function` or a template parameter.
:::

:::qa Strategy vs State: what is the difference? {level=medium}
Both delegate to an interface. With **Strategy**, the *client* picks the algorithm and it rarely changes during the object's life. With **State**, the *object itself* changes its state object as events occur, and states often know their successors. Strategy = how to do something; State = what mode am I in.
:::

:::qa What is the Observer pattern? {level=easy}
A one-to-many dependency: when a subject changes, all registered observers are notified automatically (publish/subscribe). Examples: UI events, stock tickers, model-view. The subject only knows the observer interface.
:::

:::qa What are the pitfalls of Observer in C++? {level=hard}
Lifetime (an observer destroyed while still registered gives a dangling call: use `weak_ptr` or unsubscribe in the destructor), re-entrancy (an observer that subscribes/unsubscribes during notification: iterate over a copy), exceptions from observers, notification order, memory leaks from forgotten subscriptions, and thread-safety (notify outside the lock).
:::

:::qa Push vs pull model in Observer? {level=medium}
**Push:** the subject sends the changed data in the notification (simple for observers, may send unneeded data). **Pull:** it sends only "I changed" and observers read what they need from the subject (flexible, couples observers to the subject's getters).
:::

:::qa What is the Command pattern and what is it used for? {level=easy}
It wraps a request as an object (`execute()`, often `undo()`), so you can queue, log, schedule, undo/redo and parameterise it. Examples: editor actions, task queues, remote control buttons, transactional systems.
:::

:::qa How do you implement undo/redo with Command? {level=medium}
Each command stores what it needs to reverse itself (`undo()`). An **undo stack** holds executed commands; `undo()` pops, calls `undo` and pushes onto a **redo stack**; a new command clears the redo stack. For big states use the Memento (snapshots) or store diffs.
:::

:::qa What is the State pattern? {level=easy}
An object's behaviour changes with its internal state, modelled as separate state classes behind an interface (`VendingMachine` with `Idle`, `HasMoney`, `Dispensing`). Each state handles events and decides the next state. It removes big `switch (state)` statements.
:::

:::qa State pattern vs a table-driven state machine? {level=hard}
State classes are good when each state has substantial behaviour. A transition table (`map<pair<State, Event>, State>`) is shorter for pure transitions and easy to validate or load from config. Use the table for many states with little behaviour, classes when behaviour differs a lot.
:::

:::qa What is the Template Method pattern? {level=easy}
The base class defines the **skeleton of an algorithm** (a non-virtual function) and lets subclasses override specific steps (virtual hooks): `DataMiner::mine()` calls `open()`, `parse()`, `analyse()`, `close()`. It enforces the order, and is the Hollywood principle in action.
:::

:::qa Template Method vs Strategy? {level=medium}
Template Method uses **inheritance** and fixes the structure at compile time per subclass. Strategy uses **composition** and swaps the whole algorithm at run time. Prefer Strategy when you want flexibility; Template Method when the sequence is invariant and variation is small.
:::

:::qa What is the Chain of Responsibility pattern? {level=easy}
Pass a request along a chain of handlers; each decides to handle it or forward it. Examples: logging levels, middleware, approval workflows (manager → director → VP), ATM cash dispensers (₹500 → ₹100 notes), support escalation.
:::

:::qa Chain of Responsibility vs Decorator? {level=medium}
A chain handler usually **stops** the request (or passes it on conditionally) and only one may handle it. A decorator **always** forwards and adds behaviour. Middleware pipelines blur the line: each layer may short-circuit.
:::

:::qa What is the Iterator pattern, and how does C++ implement it? {level=easy}
It provides a way to traverse a collection without exposing its structure. C++ iterators (`begin()`/`end()`, `++`, `*`) make containers work with range-for and algorithms; you implement a custom iterator type for your own collection.
:::

:::qa What is the Mediator pattern? {level=medium}
An object that coordinates communication between others, so they do not reference each other (many-to-many becomes many-to-one). A chat room, an air-traffic controller, a form dialog. Risk: the mediator becomes a God class.
:::

:::qa Mediator vs Observer? {level=medium}
Observer is a broadcast from a subject to subscribers (one-way, decoupled by events). A Mediator centralises **two-way coordination logic** between colleagues. A mediator is often built using observers.
:::

:::qa What is the Memento pattern? {level=medium}
Capture and restore an object's internal state without exposing it: the **originator** creates a `Memento` snapshot, a **caretaker** stores it. Used for undo, checkpoints, transactions. Cost: memory per snapshot (store diffs or limit history).
:::

:::qa What is the Visitor pattern, and when is it useful? {level=hard}
It adds new operations to a class hierarchy without modifying the classes, using **double dispatch**: `element.accept(visitor)` calls `visitor.visit(*this)`. Good when the element hierarchy is stable but operations change (AST printing, evaluation, export). In C++17, `std::variant` + `std::visit` gives the same with less boilerplate.
:::

:::qa What is the drawback of Visitor? {level=hard}
Adding a new element type forces changes in every visitor (it is the opposite of OCP for types), and elements must expose enough state for visitors. Choose it only when the type set is stable.
:::

:::qa What is double dispatch and how does Visitor achieve it? {level=hard}
C++ virtual calls dispatch on one object. Visitor makes two virtual calls: `accept` dispatches on the element type, then `visitor.visit(Concrete&)` is an overload chosen with the element's static type inside `accept`, so the final code depends on both the element and the visitor.
:::

:::qa What is the Interpreter pattern? {level=hard}
Represent a grammar as a class hierarchy (terminal and non-terminal expressions) and evaluate sentences by recursion: arithmetic expressions, rule conditions, query filters. Good for small DSLs; for big grammars, use a parser generator.
:::

:::qa What is the Null Object pattern? {level=medium}
Provide a do-nothing implementation of an interface instead of passing `nullptr`: a `NullLogger` that discards messages. It removes null checks and conditional code at call sites.
:::

:::qa What is the Specification pattern? {level=medium}
Encapsulate a business rule as an object with `isSatisfiedBy(candidate)`, combinable with `and/or/not`. Use for filtering and validation (`isActive && isPremium`). It is Strategy + Composite + Interpreter in one small design.
:::

:::qa Which behavioural pattern is `std::function` / a lambda callback an example of? {level=medium}
Strategy (a pluggable algorithm), Command (a request as an object) or Observer (a registered callback), depending on how it is used. The functional style often replaces the class-based patterns.
:::

```quiz
? A text editor needs undo and redo of user actions. Which pattern is the core?
- Observer
+ Command (with Memento for snapshots)
- Visitor
> Each action is an object with execute and undo.
? A vending machine behaves differently as Idle, HasMoney or Dispensing. Which pattern?
- Strategy
- Visitor
+ State
> The machine switches state objects as events occur.
```

:::keypoints
- Strategy (algorithm), State (mode), Observer (events), Command (action object, undo), Template Method (fixed skeleton), Chain (pipeline of handlers).
- Visitor needs a stable type set; Mediator centralises coordination; Memento snapshots state.
- Compare: Strategy vs State vs Template Method; Decorator vs Chain; Mediator vs Observer.
:::
