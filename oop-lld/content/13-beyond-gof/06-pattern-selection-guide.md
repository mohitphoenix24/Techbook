---
title: Choosing patterns, and anti-patterns to avoid
level: intermediate
time: 40
summary: A simple guide to picking the right pattern from the problem you have, the pairs of patterns people confuse, patterns that work well together, and the bad habits (anti-patterns) to avoid.
---

You now know all the GoF patterns and some extra ones. The real skill is **knowing which one fits**, and which one you should **not** use. This lesson is your quick guide.

## Start from the problem, not from the pattern

Read the left column. Find your problem. The right column tells you which pattern to think about.

| Your problem | Think about |
|---|---|
| Object creation is scattered or depends on input | **Factory Method / Simple Factory** |
| You must create a **matching set** of objects | **Abstract Factory** |
| An object has many optional parts, and the constructor is huge | **Builder** |
| You need to copy an object but only know its base type | **Prototype** (`clone`) |
| You truly need exactly one object | **Singleton** (carefully), or pass one object in |
| Costly objects are reused for short times | **Object Pool** |
| A third-party or old interface does not match yours | **Adapter** |
| Something varies in two independent ways (kind × platform) | **Bridge** |
| A tree of parts and wholes, treated the same | **Composite** |
| Add features to an object, in any combination | **Decorator** |
| A simple front door for a complicated group of classes | **Facade** |
| A huge number of similar objects uses too much memory | **Flyweight** |
| Control access: lazy, permission, cache, remote | **Proxy** |
| A way of doing a job must be swappable | **Strategy** |
| Many objects must know when one changes | **Observer** (or an event bus) |
| Requests as objects: queue, log, undo | **Command** |
| Behaviour depends on a life-cycle state | **State** |
| The steps of a job are fixed, but some details vary | **Template Method** |
| A request may be handled by one of several handlers | **Chain of Responsibility** |
| Walk through a collection without knowing its insides | **Iterator** |
| Many objects talk to each other in a tangle | **Mediator** |
| Save and restore a state (undo, checkpoint) | **Memento** |
| Add new jobs to a stable group of classes | **Visitor** (or `variant`) |
| A small language to evaluate | **Interpreter** |
| Avoid null checks with a harmless default | **Null Object** |
| Business rules you can combine | **Specification** |
| Keep storage away from business code | **Repository / Unit of Work** |

## A quick way to decide: "what varies?"

```text
What varies?
 ├─ WHICH CLASS gets created              → Factory Method / Abstract Factory / Prototype / Builder
 ├─ AN ALGORITHM / RULE                   → Strategy (or Template Method if the skeleton is fixed)
 ├─ BEHAVIOUR BY STATE OF AN OBJECT       → State
 ├─ ADDED RESPONSIBILITIES                → Decorator
 ├─ THE INTERFACE (mismatch)              → Adapter (retrofit) / Bridge (planned) / Facade (simplify)
 ├─ WHO HANDLES A REQUEST                 → Chain of Responsibility / Command
 ├─ WHO IS NOTIFIED OF A CHANGE           → Observer / event bus / Mediator
 ├─ WHAT OPERATION RUNS ON A STRUCTURE    → Visitor / Iterator
 └─ NOTHING VARIES                        → no pattern: write simple code
```

## Pairs that people confuse

### Strategy vs State vs Template Method vs Bridge

| | Strategy | State | Template Method | Bridge |
|---|---|---|---|---|
| How | composition | composition | inheritance | composition |
| Who picks the variant? | the user | the object itself | the subclass | the designer at the start |
| Do variants know each other? | no | yes | not applicable | no |
| Swap while running? | yes | yes (by itself) | no | yes |

### Decorator vs Proxy vs Adapter vs Facade

| | Interface | Purpose |
|---|---|---|
| **Decorator** | same | add a feature (can stack) |
| **Proxy** | same | control access |
| **Adapter** | **different** (converted) | make something fit |
| **Facade** | **new and simpler** | make a group of classes easy to use |

### Factory Method vs Abstract Factory vs Builder vs Prototype

| | Makes | How |
|---|---|---|
| Factory Method | one product | a subclass overrides the creation method |
| Abstract Factory | a matching set | a factory object with several create methods |
| Builder | one **complex** product, step by step | named steps and `build()` |
| Prototype | a copy of an existing object | `clone()` |

### Observer vs Mediator vs Command vs Chain of Responsibility

| | How the talking works |
|---|---|
| Observer | one subject tells many observers (announcement) |
| Mediator | many peers talk through one hub (coordination) |
| Command | a request object travels to the one that does the work |
| Chain | a request travels along handlers until one handles it |

## Patterns work in teams

Real designs mix patterns. Some famous pairs:

| Pair | How they fit |
|---|---|
| **Composite + Visitor** | a tree with many jobs: syntax trees, documents |
| **Composite + Iterator** | walk the tree without showing the recursion |
| **Command + Memento** | undo: the command is the action, the memento is the state to restore |
| **Command + Composite** | macro commands |
| **Strategy + Factory** | a factory picks the strategy from a setting |
| **Decorator + Factory/Builder** | a builder makes the stack of decorators |
| **State + Flyweight/Singleton** | states without data are shared |
| **Observer + Mediator** | the mediator watches its colleagues |
| **Abstract Factory + Singleton** | one factory per product family |
| **Template Method + Strategy** | the fixed steps call swappable strategies |
| **Facade + Adapter** | the facade hides adapters over third-party libraries |
| **Specification + Composite** | trees of AND/OR/NOT rules |

## Anti-patterns: what NOT to do

An **anti-pattern** is a common "solution" that looks fine but causes trouble later. Knowing their names shows good judgement.

| Anti-pattern | What you see | Simple fix |
|---|---|---|
| **God object** | one class does and knows everything | split by job |
| **Singleton abuse** | global state hiding as a Singleton | pass things in |
| **Spaghetti code** | tangled flow with no structure | extract functions, layers, patterns |
| **Golden hammer** | one favourite tool for every problem | choose by problem |
| **Pattern fever (over-engineering)** | factories for single classes, five layers of abstraction | keep it simple (YAGNI, KISS) |
| **Anemic model** | entities are data bags, all logic in "services" | put behaviour with the data |
| **Service locator** | classes pull helpers from a global registry | constructor injection |
| **Copy-paste code** | the same code in many places | extract it (DRY) |
| **Premature optimisation** | twisting the design for speed nobody measured | measure first |
| **Inheritance only for reuse** | deep trees, children that refuse parent methods | use composition |
| **Primitive obsession** | strings and ints for real ideas | small value types |
| **Circular dependencies** | A needs B, B needs A | add an interface or split the modules |
| **Magic numbers and strings** | unexplained values in code | `enum class`, named constants |
| **Leaky abstraction** | the interface shows implementation details | design from the user's side |

## How to talk about patterns in an interview

1. **Name the problem first**: "The pricing rule will change..."
2. **Then name the pattern**: "...so I make it a Strategy."
3. **Give a reason**: "I did not add a Factory here because there is only one version."
4. **Show the extension**: "To add weekend pricing, I add one class."
5. Do not name a pattern that adds nothing. **Using fewer patterns, for good reasons, is a sign of experience.**

:::exercise Pick the pattern
For each case, name the best pattern and give one line of reason:
1. A text editor must support undo and redo for typing, deleting and formatting.
2. A payment page must support cards, UPI and wallets, and new methods come every quarter.
3. A pizza shop wants any mix of toppings and crusts, with the price calculated on the fly.
4. A logging system sends messages to the console, a file and the network, depending on severity.
5. A reporting module must create PDF, Excel or HTML versions of the same report.
6. A vending machine reacts differently to coins and buttons depending on what it is doing.
:::

:::solution Answers
1. **Command** (plus **Memento** if the state is large). Each edit is a command with `undo`.
2. **Strategy** (plus a **Factory** to pick by name). Payment methods are swappable ways to do one job.
3. **Decorator**. Toppings wrap a base pizza and add cost and description.
4. **Chain of Responsibility**. Each logger handles messages at or above its level and passes them on. (Or **Observer** with level filters.)
5. **Abstract Factory** if the report has several parts that must match a format, or **Template Method** if the structure is fixed and only the rendering differs. **Strategy** also works.
6. **State**. One class per state, with transitions on events.
:::

## Short answer to say in an interview

:::interview How do you decide whether to use a design pattern?
"I start from the requirements and ask what is likely to change. Where something varies, a pattern is a known and well-named way to keep that part flexible: Strategy for a way of doing a job, State for a life cycle, Factory for creation, Observer for notifications. Where nothing varies, I keep the code simple. I always say the trade-off, and I avoid patterns that only add extra layers."
:::

```quiz
? Which pattern fits "behaviour changes as the object moves through a life cycle"?
- Strategy
+ State
- Facade
> State puts the life cycle in state objects that perform the transitions.
? What is a golden hammer?
- A tool for deleting classes
+ Using a favourite pattern or technology for every problem
- A kind of factory
> Choose tools by the problem, not by habit.
? Which pair is often used together to make undo?
- Singleton and Factory
+ Command and Memento
- Adapter and Facade
> Commands are the actions. Mementos save the state to restore.
```

:::keypoints
- Pick a pattern from the problem. Ask "what varies?" (creation, a way of doing a job, state, handlers, an interface, notifications, operations).
- Know the confusing pairs: Strategy, State, Template Method, Bridge; Decorator, Proxy, Adapter, Facade; Observer and Mediator.
- Patterns work together (Composite with Visitor, Command with Memento, Strategy with Factory).
- Know the anti-patterns: God object, Singleton abuse, Golden hammer, over-engineering, Anemic model, Service locator.
:::
