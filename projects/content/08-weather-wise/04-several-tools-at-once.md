---
title: Several tools at once
level: easy
time: 40
summary: When the question mentions two cities, Claude asks for two lookups in the same turn. How the loop runs them concurrently with asyncio.gather, why the results still go back in one message in the right order, and what a timing experiment shows about waiting for the network.
tags: parallel tool calls, asyncio, gather, tool_result, latency
---

"Compare Mumbai and Delhi for the weekend." To answer, the agent needs two places and two forecasts. A naive agent does this one thing at a time:

```text title="Sequential: four trips, one after another"
find Mumbai → find Delhi → forecast Mumbai → forecast Delhi
```

But the two `find_place` calls do not depend on each other, and neither do the two forecasts. Claude knows this, and when the tool descriptions say so, it asks for them **in the same turn**:

```text title="Parallel: two turns, each with two requests at once"
turn 1:  find Mumbai  + find Delhi
turn 2:  forecast Mumbai + forecast Delhi
```

## What Claude sends

A turn in which Claude wants two things is **one assistant message with two `tool_use` blocks**:

```text title="One assistant message, two requests"
content: [ tool_use(id "toolu_A", name "find_place", input {name: "Mumbai"}),
           tool_use(id "toolu_B", name "find_place", input {name: "Delhi"}) ]
stop_reason: "tool_use"
```

Your reply must be **one user message with two `tool_result` blocks**, each naming the `tool_use_id` it answers. (Project 7, lesson 4, listed the rule; here you will see why it matters.) If you send the results in two separate messages, the API refuses, and a model that sees its parallel calls handled badly learns not to make them.

## The loop that runs them together

```python src="weather-wise/backend/app/agent.py" region="loop" title="backend/app/agent.py"
```

Only three lines differ from TaskPal's loop:

```python
for use in tool_uses:                                       # show every request first...
    yield {"type": "tool_call", ...}
outcomes = await asyncio.gather(*(tools.call(u.name, u.input) for u in tool_uses))     # ...then run them all at once
for use, outcome in zip(tool_uses, outcomes):
    yield {"type": "tool_result", ...}
```

1. All the `tool_call` events go out first, so the browser shows both steps with a "running" dot at the same moment.
2. **`asyncio.gather`** starts every call and waits for all of them. Each `tools.call` is `async`, awaiting the network, so while one waits the others proceed. The total time is roughly that of the *slowest* call, not the sum.
3. `gather` returns the results **in the order the calls were given**, whatever order they finished. That is what lets `zip(tool_uses, outcomes)` pair each result with the right `tool_use_id`.
4. The results are then yielded and appended as **one** user message.

The browser must cope with results arriving in any order. That is why the reducer matches a result to its step *by id* (Project 7, lesson 6): the Delhi lookup may well finish before Mumbai's.

## See the time difference

This block simulates three slow requests with `asyncio.sleep` (it is a model of waiting for the network, with no weather in it) and compares doing them one after another with `gather`:

```python run title="Sequential or together?" level=easy
import asyncio, time

async def fetch(name, delay):
    await asyncio.sleep(delay)                       # stands in for waiting on the network
    return f"{name} done"

async def sequential():
    return [await fetch("Mumbai", 0.30), await fetch("Delhi", 0.10), await fetch("Pune", 0.20)]

async def together():
    return await asyncio.gather(fetch("Mumbai", 0.30), fetch("Delhi", 0.10), fetch("Pune", 0.20))

async def main():
    t = time.perf_counter(); a = await sequential(); t_seq = time.perf_counter() - t
    t = time.perf_counter(); b = await together();   t_par = time.perf_counter() - t
    print("sequential  >= 0.60 s (the sum of the waits):", t_seq >= 0.60)
    print("together    <  0.45 s (about the longest wait):", t_par < 0.45)
    print("together is faster:", t_par < t_seq)
    print("results in the order the calls were GIVEN, though Delhi finished first:")
    print(" ", b)
    print("same results either way:", a == b)

asyncio.run(main())
```

```output
sequential  >= 0.60 s (the sum of the waits): True
together    <  0.45 s (about the longest wait): True
together is faster: True
results in the order the calls were GIVEN, though Delhi finished first:
  ['Mumbai done', 'Delhi done', 'Pune done']
same results either way: True
```

Three requests of 0.3, 0.1 and 0.2 seconds take 0.6 seconds one after another and about 0.3 seconds together. With real weather requests of a second or so each, that is the difference between a snappy answer and a sluggish one. And the model call *between* the rounds (the slow part) is paid once per round, not once per request.

:::note Parallel is not always right
Run tools in parallel only when they are **independent** and **safe to run together**. Two `find_place` calls are. But "add a task" then "complete that task" are not: the second needs the first's id. Claude only asks for tools together when they do not depend on each other, and a tool that changes shared state needs care (TaskPal's store has a lock for exactly this reason). If two of your tools can conflict, run them one at a time.
:::

## Why the tools say "all in the same turn"

Look at the two tool descriptions in `tools.py`: *"When the user names several places, call this once per place, all in the same turn."* The API lets a model call several tools at once, but it is the **description and the system prompt** that make it likely. Without that sentence you will often see the sequential pattern. This is the kind of detail you find by watching the step list.

Why does the ToolBox's `places` dictionary survive two concurrent `find_place` calls? Python's `asyncio` runs on one thread and switches only at `await`. Each call's write to the dictionary happens between awaits, so two writes can never collide. (With real threads you would need a lock, as TaskPal's store does.)

:::keypoints
- Independent tool calls can be requested together in one turn, and your code can run them at the same time.
- `asyncio.gather` runs them concurrently and returns the results in the order the calls were given.
- All the results of a turn go back in ONE user message, each matched by `tool_use_id`.
- The interface must tolerate results arriving in any order: match by id.
- Parallel only works for independent calls. The descriptions and the prompt are what make a model batch its calls.
:::

```quiz
? Two find_place calls take 0.8 s and 1.0 s. About how long do they take with asyncio.gather?
- 1.8 s
+ About 1.0 s, the slowest of the two
- 0.8 s
> Concurrent waits overlap, so the total is about the longest, not the sum.
? In what order does asyncio.gather return its results?
- In the order they finish
+ In the order the calls were given
- Random
> That is what lets you pair each result with its tool_use_id.
? When should you NOT run tool calls in parallel?
- When there are more than two
+ When one depends on the result of another, or they can conflict over shared state
- When the network is fast
> Dependent or conflicting calls must run one at a time.
```

:::exercise Limit the fan-out
A user asks for "the weather in the ten largest cities in India". Claude may request ten lookups at once. What could go wrong with the weather service's rate limit (lesson 1)? Use `asyncio.Semaphore(3)` inside `ToolBox.call` so at most three requests are in flight at once, and explain what the model sees (nothing changes for it). Where would you add a test?
:::
