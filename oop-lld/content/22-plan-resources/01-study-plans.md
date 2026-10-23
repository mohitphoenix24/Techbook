---
title: Study plans and the last-day checklist
level: easy
time: 20
summary: Three plans (2, 6 and 12 weeks) that mix lessons, problems and the interview bank, how to practise a problem properly, how to revise the bank, and a checklist for the day before.
---

You have a lot of material here. This page tells you what to do with it and in what order.

## Pick your plan

| Your situation | Plan |
|---|---|
| Interview in about 2 weeks, you already write C++ | **2-week sprint** |
| Interview in 1 to 2 months | **6-week plan** |
| Learning C++ OOP from the start, or aiming for senior roles | **12-week plan** |

:::tip Three habits that matter more than the plan
1. **Write code.** Every day, type at least one program from this course. Reading alone does not stick.
2. **Say it aloud.** Explain each design as if the interviewer were in the room.
3. **Revise by recall.** Use the [Q&A bank](#/qa) and mark answers as known only when you could say them without looking.
:::

## 2-week sprint

| Days | Do |
|---|---|
| 1 to 2 | [OOP core concepts](#/l/core-concepts), [C++ basics](#/l/cpp-basics) bank, skim classes and inheritance modules |
| 3 | Copy and move, virtual functions, smart pointers: bank lessons plus the [output puzzles](#/l/output-puzzles-classes) |
| 4 | SOLID (module 9) and the SOLID bank |
| 5 to 6 | Patterns: creational, structural, behavioural; read the [which pattern](#/l/which-pattern) bank |
| 7 | [How to solve LLD problems](#/l/how-to-solve-lld-problems) and the [toolkit](#/l/lld-toolkit) |
| 8 to 12 | One problem per day on paper first: parking lot, vending machine, LRU cache, rate limiter, elevator |
| 13 | Concurrency bank; [find the bug](#/l/find-the-bug) |
| 14 | Mock: pick a new problem, set a 45-minute timer, speak aloud. Then the cheat sheets |

## 6-week plan

| Week | Focus | Output |
|---|---|---|
| 1 | C++ OOP foundations (modules 2 to 4) | Rewrite the String and Vector exercises from memory |
| 2 | Templates, resource management, modern C++ (modules 5 to 7) | Pass the OOP bank quickly (known-count above 70%) |
| 3 | UML, SOLID, creational and structural patterns (modules 8 to 11) | Draw five class diagrams from scratch |
| 4 | Behavioural patterns, beyond GoF, concurrency (modules 12 to 14) | Build a thread-safe cache and a thread pool |
| 5 | Basic and intermediate problems (8 to 10 of them) | Each: paper first, code, then compare |
| 6 | Advanced problems (3 or 4), LLD bank, mocks | Two timed mock interviews |

## 12-week plan

| Weeks | Focus |
|---|---|
| 1 to 3 | Modules 2 to 4: every lesson, type every example, finish the exercises |
| 4 to 5 | Modules 5 to 7: templates, RAII, smart pointers, modern C++ |
| 6 | Modules 8 and 9: UML, design principles, SOLID |
| 7 to 8 | Modules 10 to 13: all the patterns |
| 9 | Modules 14 and 15: concurrency, testing, refactoring |
| 10 | All Basic problems (14), two a day |
| 11 | Intermediate problems (16), two a day |
| 12 | Advanced problems, interview banks, mocks |

## How to practise one LLD problem (45 to 60 minutes)

1. Read only the problem card. Set a timer for 30 minutes.
2. Write requirements and assumptions, list the nouns and verbs, draw the class diagram.
3. Code the interfaces and the main flow in a scratch file.
4. Open the lesson. Compare classes, patterns, and edge cases. Write down what you missed.
5. Next day, re-type the core from memory in 20 minutes.
6. Answer the lesson's follow-up questions aloud.

## How to revise the interview bank

- First pass: open each question, answer aloud, then compare. Mark as known only if you were right.
- Second pass (two days later): filter to **To revise** and repeat.
- Filter by **Advanced** the day before to polish the hardest.
- Use search on the Q&A page for a topic that worries you (for example `virtual` or `deadlock`).

## The day before

:::tip Checklist
- Read the [OOP cheat sheet](#/l/cheat-sheet) and the [LLD cheat sheet](#/l/lld-cheat-sheet).
- Re-read the 45-minute routine in [how to solve LLD problems](#/l/how-to-solve-lld-problems).
- Solve one familiar problem fast, just to warm up.
- Prepare your editor or whiteboard habits: names, small functions, `const`, `override`, RAII.
- Sleep. A rested mind designs better than a tired one.
:::

## Interview-day reminders

- Ask questions for the first five minutes. State assumptions.
- Draw before you code. Keep the diagram small.
- Start with the happy path, then edge cases, then extensions.
- Narrate trade-offs: "I chose X because Y; the alternative is Z."
- If stuck, trace a use case through your classes out loud.

```quiz
? You solved a problem by reading the solution. What is the best next step?
- Move to the next problem
+ Close the lesson and re-code it from memory the next day
- Read it again
> Retrieval from memory is what makes it stick.
```

:::keypoints
- Choose a plan by time left; mix lessons, problems and bank revision every week.
- Practise problems on paper first, then compare; redo them from memory.
- Revise the bank by recall, not by re-reading.
:::
