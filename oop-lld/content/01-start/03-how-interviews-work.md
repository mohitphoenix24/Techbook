---
title: How OOP and LLD interviews work
level: easy
time: 15
summary: The three kinds of rounds (C++/OOP fundamentals, machine coding, whiteboard LLD), what each one grades, a minute-by-minute plan for a 45-minute design round, and the habits that separate strong answers from weak ones.
---

"Low-level design" means designing the **classes and their interactions** for one feature or application: the code structure, not the servers. (High-level design is about servers, databases and networks. That is a different course.) Knowing the format of the round makes your preparation twice as efficient.

## The three kinds of rounds

| Round | Typical length | What happens | What is graded |
|---|---|---|---|
| **1. C++ / OOP fundamentals** | 30 to 60 min | Questions: virtual functions, copy vs move, smart pointers, "what is the output?" puzzles, small code tasks | Accuracy of concepts, depth, the *why* behind rules |
| **2. Machine coding** | 90 to 120 min | You get a problem (for example, a parking lot) and must write **working, runnable code** in an editor or IDE, with a demo | Clean code, working flow, extensibility, handling edge cases, tests or a driver |
| **3. Whiteboard LLD / OOD** | 45 to 60 min | Talk and draw: requirements, classes, relationships, patterns, key methods, sometimes core code | Communication, entities, relationships, SOLID, pattern choice, trade-offs |

Product companies often use rounds 2 and 3; many also have round 1. This course trains all three: Part I for round 1, Parts II and III for rounds 2 and 3, Part IV for revision.

## What interviewers really look for

1. **You clarify before you design.** Strong candidates ask 5 to 8 questions in the first five minutes. Weak ones start drawing boxes.
2. **The classes match the problem.** Nouns become classes, verbs become methods, and each class has *one clear job*.
3. **Relationships make sense.** Is it *has-a* or *is-a*? Who owns whom? What dies when what dies?
4. **Patterns are used for a reason.** "I used Strategy because pricing rules change often" is good. A pattern added to look clever is bad.
5. **The design can grow.** The interviewer will ask "now add a new vehicle type" or "now support discounts". Your design should absorb it with *new* code, not edits everywhere.
6. **Edge cases and errors are handled.** Full parking lot, invalid input, double booking, two users at the same time.
7. **The code is readable.** Names, small functions, no giant switch statements.

:::warn Red flags
- Starting to code in the first minute.
- One giant `Manager` class that does everything (a "god class").
- Public data members everywhere.
- Inheritance used just to share code.
- Never mentioning concurrency when the problem has many users.
- Saying "I would use Singleton" for everything.
:::

## A 45-minute plan for a whiteboard LLD round

```viz algo=seq title="Where the time goes in a 45-minute LLD round"
participant you You [user]
participant it Interviewer [users]
you -> it : Ask clarifying questions | 5 minutes. Scope, actors, must-have vs nice-to-have.
it --> you : Requirements + constraints
you -> it : List entities and relationships | 5 minutes. Draw the class diagram with boxes and arrows.
you -> it : Walk through the main flows | 5 minutes. Park, pay, leave: say which object calls which.
you -> it : Pick patterns and justify them | 5 minutes. Only where change is likely.
you -> it : Write the core code | 15 minutes. Interfaces first, then two or three key classes.
you -> it : Handle extensions and concurrency | 5 minutes. "What if we add X?" "What if two threads...?"
it --> you : Follow-up questions
```

The numbers are a guide. The order matters more: **requirements, entities, flows, patterns, code, extensions**. Part III of this course drills exactly this routine on 40+ problems.

## Round 2: machine coding is different

In machine coding nobody reads your diagram. They **run your code**. So:

- Spend the first 10 minutes on a short design: entities, interfaces, folder layout.
- Make the main flow work *end to end* in the first 40 minutes, even if ugly. Then improve.
- Use clear `main()` demo code that prints what happens. Interviewers love output they can read.
- Keep each class small. Add comments only for decisions.
- Mention what you would add (tests, locks, persistence) even if there is no time.

:::interview What a strong opening sounds like
"Before I design, let me confirm the scope. Is this a single parking lot or a chain? Which vehicle types? How is the fee calculated? Do I need to support multiple entry gates at the same time? Should I design for payment, or just for ticketing? I will assume X, Y, Z. Is that fine?"
:::

## Round 1: what C++ fundamentals questions look like

- **Explain**: "What is a virtual destructor and why do you need it?"
- **Compare**: "`struct` vs `class`", "`unique_ptr` vs `shared_ptr`", "copy constructor vs copy assignment".
- **Predict the output**: a 20-line program with an object slicing trap or a constructor order trap.
- **Write**: "Implement a `Vector`/`String`/`SharedPtr` class from scratch".
- **Debug**: "This code crashes sometimes. Why?"

All of these are in the **OOP bank** (module 20), grouped by topic.

```quiz
? In an LLD round, what should you do in the first five minutes?
- Write the main function
+ Ask clarifying questions and agree on scope
- Draw the database schema
> Requirements first. Without them, you may design the wrong system. It also shows the interviewer how you think.
? Which of these is a good reason to apply a design pattern?
- It makes the diagram look more professional
+ A real requirement is likely to change, and the pattern isolates that change
- The interviewer used the word "pattern"
> Patterns are tools for managing change. Use them where a variation point exists, and say why.
```

:::keypoints
- There are three rounds: fundamentals, machine coding, whiteboard LLD. Prepare for all three.
- Always: clarify, list entities, show flows, choose patterns with reasons, code, then extend.
- Interviewers grade structure and change-readiness more than clever tricks.
- Mention concurrency and testing even if you have no time to implement them.
:::
