---
title: "LLD interview: process and approach"
level: easy
time: 25
summary: Simple answers about how an LLD round works: what it is, how to start, what to ask, how to find classes, how much code to write, and what the interviewer is checking.
---

Open the [method lesson](#/l/how-to-solve-lld-problems) for the full routine. Here are the questions about the **process** itself.

How to use this page: read the question, try to answer in your own words, then open it. The **Say this** line is the short answer for the interview. The part below it explains in simple words.

:::qa What is a low-level design (LLD) interview, and how is it different from high-level design? {level=easy}
**Say this:** "LLD is designing the classes and code inside one part of a system, like a parking lot. HLD is designing the big pieces, like servers and databases, and how they talk."

**In simple words:** HLD is the city map. LLD is the plan of one house. In LLD you decide the classes, what each one does, and how they connect, and you usually write real code.
:::

:::qa What are the steps you follow in an LLD interview? {level=easy}
**Say this:** "Ask questions, list the classes, connect them, add patterns only where something can change, code the main flow, then talk about edge cases and extensions."

**In simple words:**
1. Ask questions about the requirements and what is not needed.
2. List the nouns (classes) and verbs (methods).
3. Draw how the classes connect.
4. Use a pattern only where there is a real choice or change.
5. Write the main classes and the main flow.
6. Walk through normal cases and edge cases.
7. Talk about what you would add later, threads, and testing.
:::

:::qa What clarifying questions do you ask first? {level=easy}
**Say this:** "Who uses it, what are the main use cases, how many users at once, what is out of scope, and what may change later."

**In simple words:** Ask short questions like these:
- Who are the users? (customer, admin)
- What are the 3 to 5 main things they do?
- Is it one user or many at the same time?
- Do we need to save data?
- What are the limits (size, price, time)?
- What is **not** needed?
- What might we add later? (a new vehicle type, a new payment method)
:::

:::qa How do you find the classes for a problem? {level=easy}
**Say this:** "I underline the nouns in the requirements for classes and the verbs for methods. Then I keep only the nouns that have behaviour or identity."

**In simple words:** Nouns are possible classes. Verbs are possible methods. But not every noun is a class. If something is only a value (like a price), it is a field. If it is a fixed list (like Available or Booked), it is an `enum`. Also look for things with a life cycle (State), rules that can change (Strategy), and a "main class" that holds the rest.
:::

:::qa How much code should you write in a 45-minute LLD round? {level=medium}
**Say this:** "Enough to show the design works: the interfaces, the main classes and the main flow. About 100 to 200 lines, not every getter."

**In simple words:** A good split of time: 5 minutes for questions, 10 for design and the diagram, 20 for code, 10 for edge cases and extensions. Always ask the interviewer how much code they expect.
:::

:::qa What do interviewers score in an LLD round? {level=medium}
**Say this:** "Clear requirements, the right classes with clear jobs, patterns used for a reason, easy to extend, edge cases and threads handled, clean code, easy to test, and clear explanations."

**In simple words:** They are not only checking if your code runs. They are checking *how you think*: do you ask questions, do you split the work into sensible classes, can your design take a new requirement, and can you explain your choices.
:::

:::qa How do you avoid over-engineering? {level=medium}
**Say this:** "I add an interface only where there is a real second case, or the interviewer has mentioned a change. Otherwise I keep it simple."

**In simple words:** Do not make ten interfaces with one class each. Say: "If a new type comes, I would add a Strategy here." That shows you know the pattern without filling the code with things nobody needs. The rule is called YAGNI: You Aren't Gonna Need It.
:::

:::qa What should you do if you get stuck? {level=easy}
**Say this:** "I say what I am thinking, take one use case and trace it through my classes, and write the simplest version first."

**In simple words:** Silence is the worst thing. Think aloud, ask a small question, and walk through one example step by step. Interviewers prefer to see your thinking than to see you frozen.
:::

:::qa How do you decide between a class and an enum or a plain struct? {level=easy}
**Say this:** "A fixed list of names is an enum. Just data is a struct. Data plus rules to protect is a class."

**In simple words:**
- Only names, like `Available`, `Booked`: use `enum class`.
- Only data, no rules: use a `struct`.
- Rules, or a behaviour that can change: use a class (maybe with an interface).
:::

:::qa How do you handle non-functional requirements in LLD? {level=medium}
**Say this:** "I name each one and show the design choice that handles it."

**In simple words:** "Non-functional" means *how well* the system works, not *what* it does.
- Easy to extend: interfaces and strategies.
- Safe for many threads: locks or data that never changes.
- Easy to test: pass helpers in (a clock, an id generator).
- Fast: choose the right data structure.
- Reliable: check inputs and handle errors.

Say what is out of scope (like saving to a database) instead of building it.
:::

:::qa How do you present the class diagram? {level=easy}
**Say this:** "Boxes for classes with only the key data and methods, and arrows for the relationships. About ten classes is enough."

**In simple words:** Hollow triangle = inherits. Filled diamond = owns. Hollow diamond = has, but can live alone. Dashed arrow = just uses. Mark interfaces. Draw only what you will code.
:::

:::qa Where do you put the business logic: in entities or in services? {level=medium}
**Say this:** "Rules about one object's own data go in that object. Rules that connect several objects go in a service."

**In simple words:** A `Seat` knows if it is free. An `Account` protects its own balance. But "book these seats and take payment" involves many objects, so a service does it. Do not make entities empty bags of getters with one huge service doing everything (an "anemic" model).
:::

:::qa What are the common mistakes in LLD interviews? {level=easy}
**Say this:** "Coding without asking questions, one giant class, inheritance where composition is better, no interfaces where things change, ignoring threads and edge cases, and not explaining trade-offs."

**In simple words:** Also: using a pattern name without a reason, forgetting checks and errors, and hard-coding rules like prices and limits.
:::

:::qa How do you design for testability in an interview? {level=medium}
**Say this:** "I pass the helpers in through the constructor as interfaces, so a test can use a fake. I avoid singletons and global state."

**In simple words:** Pass in the clock, the id generator, the payment gateway and the repository. Return results instead of printing. Say how you would test the main rule with a fake. See the [toolkit lesson](#/l/lld-toolkit).
:::

:::qa How do you handle ambiguity in the problem statement? {level=easy}
**Say this:** "I say my assumption out loud, write it down, and ask if it is okay."

**In simple words:** For example: "I assume one building with 10 floors and no saving to a database." The interviewer is checking that you can make a decision, not that you can guess their answer.
:::

:::qa What is the "happy path first" approach? {level=easy}
**Say this:** "First make the normal case work from start to end, then add the errors and edge cases."

**In simple words:** For a parking lot: park a car, then pay and leave. Once that works, add "lot is full" and "wrong ticket". This way you always have something working when time runs out.
:::

```quiz
? In an LLD round, what comes before drawing classes?
- Writing the main method
+ Asking questions and listing the entities and use cases
- Choosing design patterns
> Patterns come from the things that can change. They do not come first.
```

:::keypoints
- Ask questions, find classes, connect them, add patterns where something can change, code the main flow, then edge cases and extensions.
- Objects keep their own rules. Services coordinate. Add abstractions only where things really change.
- Say your assumptions and trade-offs all the time.
:::
