---
title: Choosing patterns, and anti-patterns to avoid
level: intermediate
time: 40
summary: A decision guide for picking the right pattern from the problem you have, the pairs that are most often confused (with side-by-side tables), pattern combinations used in real designs, and the anti-patterns that interviewers expect you to name and avoid.
---

You now know 23 GoF patterns plus several extras. The real skill is **recognising which one fits**, and which not to use. This lesson is your decision aid.

## Start from the problem, not the pattern

| Your problem | Reach for |
|---|---|
| Creation logic is scattered or depends on input | **Factory Method / Simple Factory** |
| Must create **families** of matching objects | **Abstract Factory** |
| An object has many optional parts; telescoping constructors | **Builder** |
| Copy an object when you only know its base type | **Prototype** (`clone`) |
| Exactly one instance is truly needed | **Singleton** (carefully) or inject one instance |
| Expensive objects reused briefly | **Object Pool** |
| Third-party/legacy interface does not match yours | **Adapter** |
| Two independent dimensions of variation (kind × platform) | **Bridge** |
| Tree of parts and wholes treated uniformly | **Composite** |
| Add responsibilities dynamically, in combination | **Decorator** |
| A simple front door for a complex subsystem | **Facade** |
| Huge numbers of similar objects eat memory | **Flyweight** |
| Control access: lazy, protect, cache, remote | **Proxy** |
| An algorithm that should be swappable | **Strategy** |
| Many objects need to know when one changes | **Observer** (or an event bus) |
| Requests as objects: queue, log, undo | **Command** |
| Behaviour depends on a lifecycle state | **State** |
| Fixed algorithm skeleton, varying steps | **Template Method** |
| A request may be handled by one of several handlers | **Chain of Responsibility** |
| Traverse a structure without exposing it | **Iterator** |
| Peers talk in a tangled web | **Mediator** |
| Save and restore state (undo, checkpoint) | **Memento** |
| New operations on a stable class hierarchy | **Visitor** (or `variant`) |
| A small language to evaluate | **Interpreter** |
| Avoid null checks with a harmless default | **Null Object** |
| Combinable business rules | **Specification** |
| Hide storage from business logic | **Repository / Unit of Work** |

## A decision flow for "something varies"

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

## The pairs people confuse

### Strategy vs State vs Template Method vs Bridge

| | Strategy | State | Template Method | Bridge |
|---|---|---|---|---|
| Mechanism | composition | composition | inheritance | composition |
| Who chooses the variant? | client | the object itself | subclass | designer, up front |
| Variants aware of each other | no | yes | n/a | no |
| Swappable at run time | yes | yes (self-driven) | no | yes |

### Decorator vs Proxy vs Adapter vs Facade

| | Interface | Intent |
|---|---|---|
| **Decorator** | same | add behaviour (stackable) |
| **Proxy** | same | control access |
| **Adapter** | **different** (converted) | make something fit |
| **Facade** | **new and simpler** | simplify a subsystem |

### Factory Method vs Abstract Factory vs Builder vs Prototype

| | Creates | Technique |
|---|---|---|
| Factory Method | one product | subclass overrides a creation method |
| Abstract Factory | a family of products | a factory object with several creators |
| Builder | one **complex** product, step by step | named steps + `build()` |
| Prototype | a copy of an existing object | `clone()` |

### Observer vs Mediator vs Command vs Chain of Responsibility

| | Shape of communication |
|---|---|
| Observer | one subject → many observers (broadcast) |
| Mediator | many peers ↔ one hub (coordination) |
| Command | request object travels to a receiver (decouples sender from action) |
| Chain | request travels along handlers until handled |

## Patterns work in teams

Real designs combine patterns. A few classic partnerships:

| Combination | How they fit |
|---|---|
| **Composite + Visitor** | a tree (Composite) with many operations (Visitors): ASTs, documents |
| **Composite + Iterator** | traverse the tree without exposing recursion |
| **Command + Memento** | undo: command for the action, memento for the state to restore |
| **Command + Composite** | macro commands |
| **Strategy + Factory** | a factory picks the strategy from configuration |
| **Decorator + Factory/Builder** | a builder assembles the decorator stack |
| **State + Flyweight/Singleton** | stateless state objects shared |
| **Observer + Mediator** | the mediator observes colleagues |
| **Abstract Factory + Singleton** | one factory per product family |
| **Template Method + Strategy** | the skeleton calls pluggable strategies |
| **Facade + Adapter** | the facade hides a subsystem made of adapters over third-party libraries |
| **Specification + Composite** | and/or/not trees of rules |

## Anti-patterns: what NOT to do

An **anti-pattern** is a common solution that looks reasonable but causes trouble. Naming them shows judgment.

| Anti-pattern | Symptom | Fix |
|---|---|---|
| **God Object / Blob** | one class does everything and knows everything | SRP: split by responsibility |
| **Singleton abuse** | globals disguised as Singletons; hidden dependencies | inject dependencies |
| **Spaghetti code** | tangled flow, no structure | extract functions, layers, patterns |
| **Golden Hammer** | using one favourite pattern/tool for everything | choose by problem |
| **Pattern fever / over-engineering** | factories for single-implementation classes, 5 layers of abstraction | YAGNI, KISS |
| **Anemic Domain Model** | entities are data bags; all logic in "services" | put behaviour in the entities that own the data |
| **Service Locator** | classes pull dependencies from a global registry | constructor injection |
| **Copy-paste programming** | the same code in many places | DRY: extract |
| **Premature optimisation** | contorting design for speed nobody measured | measure first |
| **Inheritance for reuse** | deep hierarchies, refused bequest | composition |
| **Primitive obsession** | strings and ints for domain concepts | value types |
| **Circular dependencies** | A needs B needs A | introduce an interface, a mediator or split modules |
| **Magic numbers/strings** | unexplained literals | `enum class`, named constants |
| **Leaky abstraction** | the interface exposes implementation details | redesign from the client's view |

## How to talk about patterns in an interview

1. **Name the problem first**: "the pricing rule will vary…"
2. **Then the pattern**: "…so I make it a Strategy."
3. **Justify with a trade-off**: "I did not use a Factory here because there is only one implementation."
4. **Show the extension**: "to add weekend pricing I add one class."
5. Do not name-drop patterns that add nothing. **Restraint is a sign of seniority.**

:::exercise Pick the pattern
For each, name the best pattern and one line of justification:
1. A text editor must support undo and redo for typing, deleting and formatting.
2. A payment page must support cards, UPI and wallets, and new methods are added every quarter.
3. A pizza shop wants any combination of toppings and crusts with price calculated dynamically.
4. A logging framework sends messages to console, file and network depending on severity.
5. A reporting module must create PDF, Excel or HTML versions of the same report.
6. A vending machine reacts differently to coins and buttons depending on what it is doing.
:::

:::solution Answers
1. **Command** (+ **Memento** for heavy state): each edit is a command with `undo`.
2. **Strategy** (plus a **Factory** to pick by name): payment methods are interchangeable algorithms.
3. **Decorator**: toppings wrap a base pizza adding cost and description.
4. **Chain of Responsibility**: loggers each handle messages at or above their level and pass on. (Or **Observer** with level filters.)
5. **Abstract Factory** if a report consists of several parts that must match a format (header, table, chart), or **Template Method** if the structure is fixed and only rendering differs. **Strategy** also works.
6. **State**: one class per state, with transitions on events.
:::

:::interview How do you decide whether to use a design pattern?
"I start from the requirements and ask what is likely to change. Where something varies, a pattern is a known, well-named way to isolate it: Strategy for algorithms, State for lifecycle, Factory for creation, Observer for notifications. Where nothing varies I keep the code simple. I mention the trade-off of each choice, and I avoid patterns that add indirection with no benefit."
:::

```quiz
? Which pattern fits "behaviour changes as the object moves through a lifecycle"?
- Strategy
+ State
- Facade
> State encodes the lifecycle in state objects that perform transitions.
? What is a Golden Hammer?
- A tool for deleting classes
+ Using a favourite pattern or technology for every problem
- A kind of factory
> Choose tools by the problem, not by familiarity.
? Which pair is often combined to implement undo?
- Singleton and Factory
+ Command and Memento
- Adapter and Facade
> Commands represent actions; mementos capture the state to restore.
```

:::keypoints
- Pick a pattern from the problem: what varies? (creation, algorithm, state, responsibilities, interface, handler, notification, operation).
- Know the confusing pairs: Strategy/State/Template/Bridge; Decorator/Proxy/Adapter/Facade; Observer/Mediator.
- Patterns combine (Composite+Visitor, Command+Memento, Strategy+Factory).
- Name anti-patterns: God Object, Singleton abuse, Golden Hammer, over-engineering, Anemic Domain, Service Locator.
:::
