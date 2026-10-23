---
title: "LLD interview: process and approach"
level: easy
time: 25
summary: What an LLD round is, how to start, what to ask, how to find classes, how much code to write, how to handle time, and what interviewers score.
---

Open the [method lesson](#/l/how-to-solve-lld-problems) for the full routine. These are the questions about the *process* itself.

:::qa What is a low-level design (LLD) interview, and how is it different from high-level design? {level=easy}
LLD designs the **classes, interfaces, relationships and methods** of one component or application (a parking lot, an elevator), usually with real code. HLD (system design) designs **services, databases, queues and scale** across machines. LLD is about code structure and extensibility; HLD is about architecture and capacity.
:::

:::qa What are the steps you follow in an LLD interview? {level=easy}
1. Clarify requirements and scope (functional, non-functional, out of scope).
2. List entities and actions (nouns and verbs).
3. Define relationships and draw a class diagram.
4. Choose patterns where a real variation point exists.
5. Write the core classes and flow; keep the interface clean.
6. Walk through scenarios and edge cases.
7. Discuss extensions, concurrency and testing.
:::

:::qa What clarifying questions do you ask first? {level=easy}
Who are the users and actors? What are the 3 to 5 core use cases? What is the scale (single machine, concurrent users)? What must be persisted? What are the rules and limits (capacity, pricing, time)? What is out of scope? Are there extensions I should leave room for (new vehicle types, new payment methods)?
:::

:::qa How do you find the classes for a problem? {level=easy}
Underline **nouns** in the requirements (candidate classes/attributes) and **verbs** (candidate methods). Then filter: a noun with behaviour or identity becomes a class; one that is just a value becomes an attribute or enum. Look for lifecycles (state), rules that vary (strategy) and collections that need an owner (manager/service).
:::

:::qa How much code should you write in a 45-minute LLD round? {level=medium}
Enough to show the design works: interfaces and core classes with the main flow implemented (about 100 to 200 lines), not every getter. Spend ~5 min on requirements, ~10 on design and diagram, ~20 on code, ~10 on edge cases and extensions. Always ask the interviewer what level of code they expect.
:::

:::qa What do interviewers score in an LLD round? {level=medium}
Requirement gathering, **object modelling** (right classes and responsibilities), use of SOLID and patterns where useful (not forced), extensibility, handling of edge cases and concurrency, code quality (naming, small functions), testability and clear communication of trade-offs.
:::

:::qa How do you avoid over-engineering? {level=medium}
Add an abstraction only when there is a **second concrete need** or the interviewer has named an extension. Start with simple classes, say where you would add a strategy/factory *if* a new variant appears, and keep patterns out of code that has no variation. YAGNI beats a design with ten interfaces and one implementation each.
:::

:::qa What should you do if you get stuck? {level=easy}
Say what you are thinking, go back to the use case and trace it step by step through your classes, and write the simplest version first. Ask a clarifying question. Interviewers prefer a visible thought process to silence.
:::

:::qa How do you decide between a class and an enum or a plain struct? {level=easy}
If the thing has only a name or a fixed set of values and no behaviour, use an `enum class`. If it has data but no behaviour, use a `struct`. If it has behaviour that varies or invariants to protect, make it a class (maybe with an interface).
:::

:::qa How do you handle non-functional requirements in LLD? {level=medium}
Name them and map each to a design choice: **extensibility** (interfaces and strategies), **thread-safety** (locks, immutability), **testability** (dependency injection, injectable clock), **performance** (right data structure and complexity), **reliability** (validation, errors). Mention but do not implement what is out of scope (persistence, networking).
:::

:::qa How do you present the class diagram? {level=easy}
Boxes for classes with key fields and methods only; arrows for inheritance (hollow triangle), composition (filled diamond), aggregation (hollow diamond) and dependency (dashed). Mark interfaces. Keep it to what you will code; ten classes is plenty.
:::

:::qa Where do you put the business logic: in entities or in services? {level=medium}
Rules that belong to **one object's own state** (a `Seat` knows if it is free; an `Account` guards its balance) go in the entity. Logic that coordinates **several objects** or external resources (booking, transfer, matching) goes in a service/manager. Avoid an "anemic" model where entities are just getters and one giant service does everything.
:::

:::qa What are the common mistakes in LLD interviews? {level=easy}
Jumping to code without requirements; a God class; inheritance where composition fits; no interfaces at variation points; ignoring concurrency or edge cases; using patterns by name only; forgetting validation and errors; hard-coding rules (prices, limits); not discussing trade-offs.
:::

:::qa How do you design for testability in an interview? {level=medium}
Inject dependencies through constructors (clock, id generator, payment gateway, repository), depend on interfaces, avoid singletons and static state, return results instead of printing. Mention how you would test the core rule with a fake. See the [toolkit lesson](#/l/lld-toolkit).
:::

:::qa How do you handle ambiguity in the problem statement? {level=easy}
State your assumption out loud and write it down ("assume a single building, 10 floors, no persistence"). Ask if it is acceptable. Interviewers are checking that you can decide, not that you guess their answer.
:::

:::qa What is the "happy path first" approach? {level=easy}
Implement the main use case end to end (for example park a car and pay), then add rejections and edge cases. It guarantees you have a working core before time runs out.
:::

```quiz
? In an LLD round, what comes before drawing classes?
- Writing the main method
+ Clarifying requirements and listing entities and use cases
- Choosing design patterns
> Patterns come from the variation you discover, not the other way round.
```

:::keypoints
- Requirements → entities → relationships → patterns where needed → code the core flow → edge cases → extensions.
- Entities hold their own rules; services coordinate; abstractions only at real variation points.
- Communicate assumptions and trade-offs constantly.
:::
