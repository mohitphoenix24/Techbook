---
title: Clean code for machine-coding rounds
level: easy
time: 30
summary: The habits that make your code easy to read in a machine-coding round: good names, small functions, comments that explain why, helpful C++ habits, a clear file layout, one error-handling style, and a checklist to run before you finish.
---

In a machine-coding round, the reviewer reads your code for about 10 minutes. **Clean, simple, consistent code scores better than clever code.** Here are the habits that matter most.

## Naming

Good names make comments unnecessary.

| Do | Avoid |
|---|---|
| Nouns for classes: `ParkingLot`, `Ticket`, `PricingStrategy` | `Manager`, `Helper`, `Util`, `Handler` for everything |
| Verbs for methods: `park`, `unpark`, `calculateFee` | Vague verbs: `process`, `handle`, `doIt` |
| Yes/no names as questions: `isFull`, `hasSpace`, `canBorrow` | `flag`, `status` for booleans |
| Words from the **problem** (`Spot`, `Gate`, `Ticket`) | Technical noise: `SpotObj`, `TicketData` |
| Full words | `cnt`, `tmp`, `mgr`, `svc` |
| One style for members (like a trailing underscore) | Mixed styles in one file |
| Units in the name when the type cannot show it: `timeoutMs` | Just `timeout` |

## Small functions

- A function does **one thing**, at **one level** of detail.
- If you can describe it only with "and", split it. If you need to scroll to read it, split it.
- Keep parameters to 3 or 4. More than that: use a parameter object.
- Use **early returns** instead of deep nesting.

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

## Comments: say **why**, not **what**

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

## C++ habits that reviewers notice

| Habit | Why |
|---|---|
| `const` on every getter and every parameter that does not change | shows you think about changes |
| `explicit` on one-argument constructors | no surprise conversions |
| `override` on every override, and `virtual ~Base() = default` | catches mistakes, avoids leaks |
| `enum class` instead of ints or strings | type safety |
| Smart pointers, no raw `new` or `delete` | no leaks |
| Big objects by `const&`, return by value | simple and fast |
| `[[nodiscard]]` on results that must be checked | no ignored errors |
| `auto` only when the type is obvious | readability |
| `nullptr`, never `NULL` or `0` | clarity |
| Set a value for everything (`{}` or default member values) | no reading of uninitialised data |
| No `using namespace std;` in headers | no pollution |

## How to lay out a machine-coding solution

For a 90 to 120 minute round, one file is often fine. But a **clear order inside** the file (or a few files) shows maturity.

```text
parking_lot/
  models.h        enums, Vehicle, Spot, Ticket (plain data and small classes)
  strategies.h    PricingStrategy, SpotAllocationStrategy and implementations
  parking_lot.h   ParkingLot (the facade/coordinator)
  main.cpp        a demo driver that exercises the main flows and prints results
  tests.cpp       a few assertions on edge cases (optional but impressive)
```

Order in a single file, top to bottom: **enums, small value types, interfaces, implementations, the coordinator class, `main`**.

:::tip Your main() is part of the answer
The interviewer will run it. Print clear lines for each scenario: normal flow, full lot, bad input, many threads. A demo that shows "what should happen" next to "what happened" builds trust quickly.
:::

## Error handling: pick one style and say it

- **Normal business results** (lot full, not enough money): return a result (`optional`, `bool`, an `enum class`, or a small `Result` type).
- **Programmer mistakes and impossible states**: `assert`, or throw `logic_error`.
- **Bad outside input**: check at the entrance and report clearly.
- Never hide errors with `catch (...) {}`.

## Self-check before you say "done"

1. Does every class have **one clear job** and a noun name?
2. Are there **interfaces where things vary**, and **no `switch` on type codes**?
3. Are helpers **passed in**, with no hidden globals?
4. Is each class's **rule protected** (private data, constructors that check values)?
5. Is **ownership** clear (smart pointers, `const&` parameters)?
6. Did I handle **edge cases**: empty, full, duplicate, invalid, boundary values?
7. Is it **thread-safe** if the problem needs it, and did I say how?
8. Can the **next likely requirement** be added by writing a new class, not editing old ones?
9. Does the **demo** show the main scenarios and the failures?
10. Is the code **consistent** (names, format, one error style)?

## Short answer to say in an interview

:::interview What do reviewers look for in machine-coding code?
"First, working code. Then readable structure: classes with clear jobs, interfaces where requirements vary, no giant if-else chains, good names, const and RAII, handled edge cases, and a demo that shows the flows. They also check how easy it is to extend, like 'where does a new vehicle type go?', and whether I think about threads. Simple and consistent beats clever."
:::

```quiz
? What should a comment mostly explain?
- What each line does
+ Why a decision was made (the reason, the trade-off, the business rule)
- The author's name
> Good names show the what. Comments explain the why.
? What is a guard clause?
- A mutex
+ An early return that handles a bad case first, so the main logic stays flat
- A try block
> It reduces nesting and makes the normal path clear.
? Why include a main() demo in a machine-coding answer?
- The compiler needs it
+ So reviewers can run it and see the main flows and edge cases work
- To hide bugs
> It shows behaviour and builds trust.
```

:::keypoints
- Name things with words from the problem: nouns for classes, verbs for methods. Keep functions small with early returns. Comment the why.
- C++ habits: const, explicit, override, enum class, smart pointers, [[nodiscard]], initialised members.
- Keep a clear order (enums, values, interfaces, implementations, coordinator, main). Finish with a demo and the self-check list.
:::
