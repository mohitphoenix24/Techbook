---
title: "LLD interview: trade-offs, testing and communication"
level: medium
time: 30
summary: How to explain design choices, handle 'why not X' challenges, discuss testing and extensibility, answer behavioural follow-ups, and the phrases that show senior-level thinking.
---

:::qa "Why did you use an interface here?" How do you answer? {level=easy}
Name the **variation** it protects: "Payments will have several providers, so `PaymentGateway` lets us add one without touching checkout, and tests can use a fake." If there is no variation, say so and keep the concrete class.
:::

:::qa "Why inheritance here and not composition?" {level=medium}
Answer with the substitution test: "Every `Car` can be used anywhere a `Vehicle` is expected, and the shared behaviour is stable." If it is just code reuse, switch: "I would hold a `Pricing` object instead; that keeps the classes independent."
:::

:::qa "Your design has many small classes. Isn't that over-engineering?" {level=medium}
Accept the concern, justify each class by a requirement or extension, and offer to merge: "If we never need a second pricing rule, `PricingPolicy` can collapse into a function. I added it because the prompt mentions seasonal pricing."
:::

:::qa How do you explain the trade-off between simplicity and flexibility? {level=medium}
"The simple version is one class and runs today; the flexible version adds an interface so we can swap implementations. I would start simple and introduce the interface when the second implementation appears, since the change is small and safe with tests."
:::

:::qa How do you describe the time and space complexity of your design choices? {level=medium}
For each core operation, name the structure and cost: "lookup is O(1) average in the hash map; eviction is O(1) with the list; memory is O(n). A balanced tree would give ordering at O(log n)." Interviewers like numbers.
:::

:::qa What is your approach to unit testing a design like this? {level=medium}
Test the business rules at the class level with injected fakes (clock, repository, gateway), table-driven cases for edge conditions, and a few integration tests for the main flow. Mention what is hard to test (time, randomness, threads) and the seam you added to make it testable.
:::

:::qa How do you test code that depends on time or randomness? {level=medium}
Inject a `Clock` and a `RandomSource` interface; in tests use a fake clock you can advance and a seeded or scripted random source. Never call `now()` or `rand()` inside business logic.
:::

:::qa How do you design for logging and monitoring? {level=medium}
Log key business events with ids and outcomes through an injected logger; expose counters (requests, failures, latency) through a metrics interface; avoid logging secrets; make failures observable (error codes, not silent catches).
:::

:::qa How do you handle errors in a design: exceptions or return codes? {level=medium}
Use exceptions for unexpected failures and programmer errors; use result types or `optional` for expected outcomes (`BOOKING_FAILED`, `NOT_FOUND`). Be consistent per layer, document it, and translate low-level errors into domain errors at boundaries.
:::

:::qa How do you validate input in a clean way? {level=easy}
Validate at the boundary (service API), keep invariants inside entities (constructors reject invalid state), and use value types (`Email`, `Money`) that cannot hold invalid values. Return clear error messages.
:::

:::qa How do you make your design extensible without predicting the future? {level=hard}
Isolate the likely axes of change behind interfaces, keep classes small and cohesive, avoid hard-coded constants (inject configuration), and keep dependencies pointing inward. Say which changes are cheap and which would need a refactor.
:::

:::qa The interviewer adds a new requirement late. How do you respond? {level=medium}
Restate it, trace where it plugs into the current design ("a new vehicle type goes here"), say what changes (ideally one new class), and note any existing assumption that breaks. Calm, structured adaptation is the test.
:::

:::qa How do you decide what to persist and where does the database fit in LLD? {level=medium}
Hide storage behind a **Repository** interface (`save`, `findById`) so the domain does not know SQL. For the interview, use an in-memory implementation and say how a database-backed one would plug in (transactions, indexes).
:::

:::qa Walk me through how a request flows through your design. {level=easy}
Pick one use case and narrate it with class and method names in order: "`ParkingService.park()` asks `SlotAllocator` for a slot, creates a `Ticket`, marks the slot occupied, returns the ticket." A sequence diagram or code walk shows the design works.
:::

:::qa What would you do differently with more time? {level=easy}
Pick two or three concrete items: persistence, concurrency control, metrics, more tests, configuration, the extension you skipped. It shows you know the gaps.
:::

:::qa How do you handle disagreement with an interviewer about a design choice? {level=medium}
Listen, restate their concern, compare the options on explicit criteria (extensibility, simplicity, performance), and either adopt their suggestion or explain why yours fits the stated requirements. Stay curious, not defensive.
:::

:::qa Tell me about a time you improved a bad design (behavioural). {level=medium}
Use STAR: **Situation** (a module where every change broke something), **Task** (reduce risk), **Action** (added tests, extracted interfaces, split the God class step by step), **Result** (fewer bugs, faster changes). Give a number if you can.
:::

:::qa How do you keep code readable in an interview? {level=easy}
Descriptive names, small functions, consistent style, `const` and `override`, comments only for intent, one class per responsibility, no clever tricks. Write as if someone else will maintain it tomorrow.
:::

:::qa What phrases signal senior-level thinking? {level=medium}
"What are the invariants?", "Where is the variation?", "What happens on failure?", "How would we test this?", "This is O(log n) because ...", "I'd start with X and extract Y when a second case appears", "The trade-off is ... so I chose ... because ...".
:::

:::qa How do you prepare for LLD interviews in a few weeks? {level=easy}
Learn SOLID and the common patterns, solve 15 to 25 problems end to end (design on paper, then code), repeat the classics until fluent, practise explaining aloud, and review this bank. See the study plans in the plan lesson.
:::

```quiz
? An interviewer asks "why not just use a switch here?" The best reply...
- Defend the pattern no matter what
+ Explain the variation and extension that justify the abstraction, and admit a switch is fine if that variation never appears
- Agree and rewrite everything
> Trade-off reasoning beats pattern loyalty.
```

:::keypoints
- Justify every abstraction by a variation; accept simpler options when no variation exists.
- Inject time, randomness and storage so the design is testable.
- Narrate flows, state assumptions and trade-offs, and say what you would do next.
:::
