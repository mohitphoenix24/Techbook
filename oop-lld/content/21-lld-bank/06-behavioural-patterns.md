---
title: "LLD interview: behavioural patterns"
level: medium
time: 40
summary: Simple answers about Strategy, Observer, Command, State, Template Method, Chain of Responsibility, Iterator, Mediator, Memento, Visitor and Interpreter, and how to compare them.
---

:::qa What is the Strategy pattern? {level=easy}
**Say this:** "Keep different ways of doing one job in separate classes behind one interface, and pick one when needed."

**In simple words:** A `Cart` with `PricingStrategy` (`Regular`, `Festival`, `Bulk`). It replaces if-else chains. In C++ a strategy can also be a `std::function` or a template parameter.
:::

:::qa Strategy vs State: what is the difference? {level=medium}
**Say this:** "In Strategy the user picks the algorithm. In State the object changes its own state as things happen."

**In simple words:** Strategy = **how** to do something. State = **what mode** am I in. States often know the next state. Strategies do not know each other.
:::

:::qa What is the Observer pattern? {level=easy}
**Say this:** "One object announces changes, and many others who subscribed are told automatically."

**In simple words:** Like a YouTube channel and its subscribers. The subject only knows the observer interface. Examples: button clicks, stock prices, model and view.
:::

:::qa What are the pitfalls of Observer in C++? {level=hard}
**Say this:** "An observer may be destroyed while still subscribed. The list can change during notification. Threads and errors need care."

**In simple words:** Use `weak_ptr` or a subscription token. Loop over a copy of the list. Notify outside the lock. And do not forget to unsubscribe.
:::

:::qa Push vs pull model in Observer? {level=medium}
**Say this:** "Push sends the data with the notification. Pull only says 'something changed', and the observer asks for what it needs."

**In simple words:** Push is simple but may send unneeded data. Pull is flexible but ties observers to the subject's methods.
:::

:::qa What is the Command pattern and what is it used for? {level=easy}
**Say this:** "It turns a request into an object, so I can store it, queue it, log it, and undo it."

**In simple words:** Like an order slip in a restaurant. Examples: editor actions, task queues, remote control buttons.
:::

:::qa How do you implement undo/redo with Command? {level=medium}
**Say this:** "Each command has `execute` and `undo`. I keep an undo stack and a redo stack. A new command clears the redo stack."

**In simple words:** Run a command, push it on the undo stack. Undo: pop it, call `undo()`, push it on the redo stack. For big state, use Memento (snapshots).
:::

:::qa What is the State pattern? {level=easy}
**Say this:** "An object behaves differently in each state, and each state is its own class."

**In simple words:** A vending machine with `Idle`, `HasMoney` and `Dispensing`. Each state decides what each action does and what comes next. It removes big `switch (state)` code.
:::

:::qa State pattern vs a table-driven state machine? {level=hard}
**Say this:** "State classes are good when each state has real behaviour. A table is shorter when states mostly just move to other states."

**In simple words:** A table like `map<pair<State, Event>, State>` is easy to check and can come from a config file.
:::

:::qa What is the Template Method pattern? {level=easy}
**Say this:** "The base class fixes the steps of a job, and children fill in some steps."

**In simple words:** `DataMiner::mine()` calls `open()`, `parse()`, `analyse()`, `close()` in that order. Children change `parse()` only. It follows the Hollywood idea: the base calls the child.
:::

:::qa Template Method vs Strategy? {level=medium}
**Say this:** "Template Method uses inheritance and changes steps. Strategy uses composition and swaps the whole job."

**In simple words:** Strategy can be changed while running. Template Method is fixed by which subclass you choose.
:::

:::qa What is the Chain of Responsibility pattern? {level=easy}
**Say this:** "A request goes along a line of handlers. Each handles it or passes it on."

**In simple words:** Examples: logging levels, middleware, approval by manager then director, an ATM giving Rs 500 and then Rs 100 notes.
:::

:::qa Chain of Responsibility vs Decorator? {level=medium}
**Say this:** "A chain handler may stop the request. A decorator always passes it on and adds something."

**In simple words:** Middleware is in between: each layer may stop the request or let it go on.
:::

:::qa What is the Iterator pattern, and how does C++ implement it? {level=easy}
**Say this:** "It lets me go through a collection without knowing how it is stored. C++ uses `begin()`, `end()` and iterators."

**In simple words:** That is why range-for and algorithms work for every container. For your own class, write `begin()`, `end()` and an iterator with `*`, `++` and `!=`.
:::

:::qa What is the Mediator pattern? {level=medium}
**Say this:** "One object in the middle controls how many objects talk to each other, so they do not know each other."

**In simple words:** A chat room, or an air-traffic tower. The risk is that the mediator becomes a giant class.
:::

:::qa Mediator vs Observer? {level=medium}
**Say this:** "Observer is a one-way announcement. Mediator is two-way coordination through a hub that holds the rules."

**In simple words:** A mediator is often built using observers.
:::

:::qa What is the Memento pattern? {level=medium}
**Say this:** "Save a snapshot of an object's state and restore it later, without exposing its private data."

**In simple words:** Used for undo, checkpoints and rollback. The cost is memory, so keep a limited history or store only differences.
:::

:::qa What is the Visitor pattern, and when is it useful? {level=hard}
**Say this:** "It adds new operations to a group of classes without editing them, using two virtual calls (double dispatch)."

**In simple words:** `element.accept(visitor)` calls `visitor.visit(*this)`. Good when the classes are stable but jobs keep growing (a syntax tree). In C++17, `std::variant` with `std::visit` often does the same job more simply.
:::

:::qa What is the drawback of Visitor? {level=hard}
**Say this:** "Adding a new element type means changing every visitor."

**In simple words:** So use it only when the set of element types is stable.
:::

:::qa What is double dispatch and how does Visitor achieve it? {level=hard}
**Say this:** "The call depends on two types: the element and the visitor. Two virtual calls give that."

**In simple words:** The first call (`accept`) finds the real element type. Inside it, `visit(*this)` picks the right overload for that type.
:::

:::qa What is the Interpreter pattern? {level=hard}
**Say this:** "One class for each grammar rule, so a sentence becomes a tree that evaluates itself."

**In simple words:** Good for small rule languages, like `age > 18 AND country == IN`. For big grammars use a parser tool.
:::

:::qa What is the Null Object pattern? {level=medium}
**Say this:** "A do-nothing object that follows the interface, so I do not need null checks."

**In simple words:** A `NullLogger` that discards messages. Do not use it where a missing object is an error that must be noticed.
:::

:::qa What is the Specification pattern? {level=medium}
**Say this:** "A business rule as an object with `isSatisfiedBy`, which can be joined with and, or, not."

**In simple words:** `isActive && isPremium`. It stops you from writing a new filter function for every combination.
:::

:::qa Which behavioural pattern is a std::function or lambda callback an example of? {level=medium}
**Say this:** "It can be Strategy, Command or Observer, depending on how it is used."

**In simple words:** A lambda passed to `sort` is a strategy. A lambda stored to run later is a command. A lambda registered for events is an observer.
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
> The machine switches state objects as events happen.
```

:::keypoints
- Strategy (a way of doing a job), State (a mode), Observer (events), Command (action object, undo), Template Method (fixed steps), Chain (a line of handlers).
- Visitor needs stable types. Mediator holds the coordination. Memento saves state.
- Compare: Strategy, State and Template Method; Decorator and Chain; Mediator and Observer.
:::
