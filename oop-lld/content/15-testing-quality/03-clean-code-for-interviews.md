---
title: Clean code for machine-coding rounds
level: easy
time: 30
summary: Naming, small functions, comments that explain why, const and explicit habits, a folder layout and main driver for a 90-minute round, error handling conventions, and a self-review checklist to run before you say you are done.
---

In a machine-coding round, a reviewer reads your code for 10 minutes. Clean, boring, consistent code scores better than clever code. These are the habits that matter.

## Naming

| Do | Avoid |
|---|---|
| Nouns for classes: `ParkingLot`, `Ticket`, `PricingStrategy` | `Manager`, `Helper`, `Util`, `Handler` for everything |
| Verbs for methods: `park`, `unpark`, `calculateFee` | Vague verbs: `process`, `handle`, `doIt` |
| Booleans as questions: `isFull`, `hasSpace`, `canBorrow` | `flag`, `status` for booleans |
| Names from the **domain language** (`Spot`, `Gate`, `Ticket`) | Technical noise: `SpotObj`, `TicketData` |
| Full words | `cnt`, `tmp`, `mgr`, `svc` |
| `m_`/trailing underscore for members, consistently | Mixed styles in one file |
| Units in names when types cannot carry them: `timeoutMs` | Bare `timeout` |

A good name removes the need for a comment.

## Small functions

- A function does **one thing** at **one level of abstraction**.
- Rule of thumb: if you can describe it only with "and", split it; if it needs scrolling, split it.
- Keep parameter lists to 3 or 4. More: a parameter object.
- Prefer **early returns** to deep nesting.

```cpp run title="Early returns flatten the logic"
#include <iostream>
#include <string>
using namespace std;

struct Request { bool authenticated; int balance; int amount; };

// Deep nesting: hard to read
string deep(const Request& r) {
    if (r.authenticated) {
        if (r.amount > 0) {
            if (r.balance >= r.amount) { return "approved"; }
            else { return "insufficient funds"; }
        } else { return "invalid amount"; }
    } else { return "not authenticated"; }
}

// Guard clauses: the failure cases first, the happy path last
string flat(const Request& r) {
    if (!r.authenticated) return "not authenticated";
    if (r.amount <= 0) return "invalid amount";
    if (r.balance < r.amount) return "insufficient funds";
    return "approved";
}

int main() {
    Request r{true, 100, 500};
    cout << deep(r) << " | " << flat(r) << "\n";
}
```

## Comments: explain why, not what

```cpp run title="Comments that earn their place"
#include <iostream>
using namespace std;

constexpr int kGraceMinutes = 15;                            // product decision: first 15 minutes are free

long fee(int minutes, long perHour) {
    // BAD: "if minutes <= 15 return 0"         (repeats the code)
    // GOOD: say WHY, and let names carry the WHAT
    if (minutes <= kGraceMinutes) return 0;
    long hours = (minutes + 59) / 60;                        // every started hour counts as a full hour
    return hours * perHour;
}

int main() { cout << fee(10, 40) << " " << fee(61, 40) << "\n"; }
```

## C++ habits reviewers notice

| Habit | Why |
|---|---|
| `const` on every getter and unchanged parameter | shows you think about mutation |
| `explicit` on one-argument constructors | no surprising conversions |
| `override` on every override; `virtual ~Base() = default` | catches mistakes, avoids leaks |
| `enum class` instead of ints/strings | type safety |
| Smart pointers, no raw `new`/`delete` | no leaks |
| Pass big objects by `const&`; return by value | efficient and simple |
| `[[nodiscard]]` on results that must be checked | no silently ignored errors |
| `auto` only where the type is obvious | readability |
| `nullptr`, never `NULL` or `0` | clarity |
| Initialise everything (`{}` or default member initialisers) | no uninitialised reads |
| No `using namespace std;` in headers | no pollution |

## Layout of a machine-coding solution

For a 90 to 120 minute round, one file is often accepted, but a **clear structure inside** the file (or a few files) shows maturity.

```text
parking_lot/
  models.h        enums, Vehicle, Spot, Ticket (plain data and small classes)
  strategies.h    PricingStrategy, SpotAllocationStrategy and implementations
  parking_lot.h   ParkingLot (the facade/coordinator)
  main.cpp        a demo driver that exercises the main flows and prints results
  tests.cpp       a few assertions on edge cases (optional but impressive)
```

Single-file order (top to bottom): **enums, small value types, interfaces, implementations, the coordinator, `main`**.

:::tip The main() driver is part of your answer
Interviewers run it. Print clear, readable lines for each scenario: normal flow, full lot, invalid input, concurrent access. A driver that shows "what should happen" next to "what happened" builds confidence quickly.
:::

## Error handling conventions

Pick **one** policy and state it:

- Recoverable business outcomes (lot full, insufficient funds): return a result (`optional`, `bool`, an `enum class`) or a small `Result` type.
- Programmer errors and impossible states: `assert` or throw `logic_error`.
- Invalid external input: validate at the boundary and report clearly.
- Never swallow exceptions silently (`catch (...) {}`).

## Self-review checklist (say it out loud at the end)

1. Does every class have **one clear responsibility** and a noun name?
2. Are there **interfaces at the variation points**, and **no `switch` on type codes**?
3. Are dependencies **injected**, with no hidden globals (no Singleton abuse)?
4. Is the **invariant** of each class protected (private data, validating constructors)?
5. Are **ownership and lifetimes** obvious (smart pointers, `const&` parameters)?
6. Did I handle **edge cases**: empty, full, duplicate, invalid, boundary values?
7. Is it **thread-safe** where the problem needs it, and did I say how?
8. Can I add **the next likely requirement** by writing a new class, not editing old ones?
9. Is the **demo** clear, and does it show the key scenarios and failures?
10. Is the code **consistent** (naming, formatting, one error-handling policy)?

:::interview What do reviewers look for in machine-coding code?
"Working code first, then readable structure: clear class responsibilities, interfaces where requirements vary, no giant conditionals, sensible naming, const-correctness and RAII, handled edge cases, and a demo that shows the flows. They also check extensibility ('add a new vehicle type: where does the change go?') and concurrency awareness. Consistency and simplicity beat cleverness."
:::

```quiz
? What should a comment mostly explain?
- What each line does
+ Why a decision was made (intent, trade-off, business rule)
- The author's name
> Good names explain the what; comments explain the why.
? What is a guard clause?
- A mutex
+ An early return that handles an invalid case first, so the main logic stays flat
- A try block
> It reduces nesting and makes the happy path obvious.
? Why include a main() driver in a machine-coding answer?
- Required by the compiler
+ So reviewers can run it and see the main flows and edge cases working
- To hide bugs
> It demonstrates behaviour and builds confidence.
```

:::keypoints
- Name by domain nouns and verbs; keep functions small with early returns; comment the why.
- C++ habits: const, explicit, override, enum class, smart pointers, [[nodiscard]], initialised members.
- Structure the solution (enums → values → interfaces → implementations → coordinator → main) and finish with a demo and the self-review checklist.
:::
