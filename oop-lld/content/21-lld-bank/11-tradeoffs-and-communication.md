---
title: "LLD interview: trade-offs, testing and communication"
level: medium
time: 30
summary: Simple answers on how to explain design choices, handle "why not X?" questions, talk about testing and extensions, answer behavioural follow-ups, and phrases that sound senior.
---

Many LLD interviews are won by how you **explain**, not only by what you design. Use these ready answers as a model.

:::qa "Why did you use an interface here?" How do you answer? {level=easy}
**Say this:** "This is a place where behaviour can change. For example, payments will have several providers, so `PaymentGateway` lets us add one without touching checkout, and tests can use a fake."

**In simple words:** Name what can change. If nothing can change, say "I would keep a plain class here".
:::

:::qa "Why inheritance here and not composition?" {level=medium}
**Say this:** "Because a Car can be used everywhere a Vehicle is expected, and the shared behaviour is stable. If it were only for reusing code, I would hold the other class as a member."

**In simple words:** The test is: can the child safely replace the parent everywhere? If yes, inheritance is fine. If not, use composition.
:::

:::qa "Your design has many small classes. Isn't that over-engineering?" {level=medium}
**Say this:** "Fair point. Each class here comes from a requirement or an expected extension, and I can merge them if we never need a second version."

**In simple words:** Accept the concern, give the reason for each class, and offer to simplify. For example, `PricingPolicy` could become a plain function if there is only one rule.
:::

:::qa How do you explain the trade-off between simplicity and flexibility? {level=medium}
**Say this:** "The simple version is one class and works today. The flexible version adds an interface so we can swap parts later. I start simple and add the interface when a second version appears."

**In simple words:** The change is small and safe if you have tests.
:::

:::qa How do you describe the time and space cost of your design choices? {level=medium}
**Say this:** "I name the data structure and its cost: lookup is O(1) in the hash map, removing is O(1) with the list, memory is O(n)."

**In simple words:** Say the alternative too: "A balanced tree gives order at O(log n)". Interviewers like numbers.
:::

:::qa What is your approach to unit testing a design like this? {level=medium}
**Say this:** "Test each rule in a class with fakes for the helpers, cover edge cases in a table of cases, and add a few tests for the main flow."

**In simple words:** Say what is hard to test (time, randomness, threads) and which seam (a replaceable part) you added to fix it.
:::

:::qa How do you test code that depends on time or randomness? {level=medium}
**Say this:** "I pass in a Clock and a RandomSource. Tests use a clock I can move and a random source that gives fixed numbers."

**In simple words:** Never call `now()` or `rand()` directly inside business code.
:::

:::qa How do you design for logging and monitoring? {level=medium}
**Say this:** "Log the important business events with ids through a logger that is passed in, count requests, failures and delays, and never log secrets."

**In simple words:** Make failures visible. Use error codes. Do not hide them with empty `catch` blocks.
:::

:::qa How do you handle errors in a design: exceptions or return codes? {level=medium}
**Say this:** "Exceptions for unexpected failures. Results (`optional` or a result type) for normal outcomes like 'not found' or 'booking failed'."

**In simple words:** Pick one style for each layer, write it down, and turn low-level errors into domain errors at the boundary.
:::

:::qa How do you validate input in a clean way? {level=easy}
**Say this:** "Check at the entrance, and make objects protect their own rules, so they cannot be created in an invalid state."

**In simple words:** Use small types like `Email` and `Money` whose constructors refuse bad values.
:::

:::qa How do you make your design extensible without predicting the future? {level=hard}
**Say this:** "I put interfaces only where change is likely, keep classes small, and avoid hard-coded numbers."

**In simple words:** Then say which changes are cheap (add a class) and which would need a refactor. That honesty is a good sign.
:::

:::qa The interviewer adds a new requirement late. How do you respond? {level=medium}
**Say this:** "I repeat it, show where it fits in my design (ideally one new class), and say which assumption it breaks."

**In simple words:** Staying calm and showing a clear plan is what is being tested.
:::

:::qa How do you decide what to save and where does the database fit in LLD? {level=medium}
**Say this:** "I hide storage behind a Repository interface, use an in-memory version in the interview, and say how a database version would plug in."

**In simple words:** The business classes never know about SQL.
:::

:::qa Walk me through how a request flows through your design. {level=easy}
**Say this:** "I pick one use case and name the classes and methods in order: `ParkingService.park()` asks `SlotAllocator` for a slot, creates a `Ticket`, marks the slot used, and returns the ticket."

**In simple words:** Telling the story step by step proves that the design works.
:::

:::qa What would you do differently with more time? {level=easy}
**Say this:** "Saving to storage, better thread safety, metrics, more tests, and the extension I skipped."

**In simple words:** Naming two or three real gaps shows you can see the limits of your own work.
:::

:::qa How do you handle disagreement with an interviewer about a design choice? {level=medium}
**Say this:** "I listen, repeat their concern, compare both options on clear points (simplicity, extensibility, speed), and then either agree or explain why mine fits the requirements."

**In simple words:** Stay curious, not defensive.
:::

:::qa Tell me about a time you improved a bad design (behavioural). {level=medium}
**Say this:** Use STAR: Situation, Task, Action, Result.

**In simple words:** Example: a module where every change broke something (Situation). I had to reduce the risk (Task). I added tests, extracted interfaces and split the God class step by step (Action). There were fewer bugs and changes were faster (Result). Give a number if you can.
:::

:::qa How do you keep code readable in an interview? {level=easy}
**Say this:** "Clear names, small functions, `const` and `override`, one class for each job, and comments only for the reason."

**In simple words:** Write as if someone else must maintain it tomorrow.
:::

:::qa What phrases signal senior-level thinking? {level=medium}
**Say this:** "What are the rules that must always hold? Where is the variation? What happens on failure? How would we test this? I would start simple and add the interface when a second case appears."

**In simple words:** Also: "The trade-off is X, so I chose Y because Z."
:::

:::qa How do you prepare for LLD interviews in a few weeks? {level=easy}
**Say this:** "Learn SOLID and the common patterns, solve 15 to 25 problems end to end, repeat the classics until easy, and practise explaining aloud."

**In simple words:** See the study plans in the plan lesson, and revise with this bank.
:::

```quiz
? An interviewer asks "why not just use a switch here?" The best reply is...
- Defend the pattern no matter what
+ Explain what can change and why the interface helps, and admit a switch is fine if that change never happens
- Agree and rewrite everything
> Reasoning about trade-offs beats loyalty to a pattern.
```

:::keypoints
- Give a reason for every abstraction. Accept a simpler option when nothing can change.
- Pass in time, randomness and storage, so the design is easy to test.
- Tell the flow step by step. Say your assumptions and trade-offs. Say what you would do next.
:::
