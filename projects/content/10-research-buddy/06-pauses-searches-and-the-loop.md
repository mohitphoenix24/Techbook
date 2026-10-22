---
title: Pauses, searches and the loop
level: easy
time: 50
summary: The agent loop for a research question. What changes when a tool runs on Anthropic's side: a long turn can pause and must be resumed, a request can mix a search with your calculator, history must be kept exactly as received, and cost has a new line item. The loop reads the same, with four new branches.
tags: agent loop, pause_turn, server tools, tool_use, usage, cost, history
---

You know the loop from Projects 7 to 9. Here it is again, for a question that may use both kinds of tool:

```python src="research-buddy/backend/app/agent.py" region="loop" title="backend/app/agent.py"
```

The structure is the same: a `for` over `max_steps`, one `client.messages.create` per step, an `error` for each SDK exception, a refusal and a `max_tokens` check. What is new is *after* the response arrives.

## 1. Read the response, report the searches

```python
blocks = [b.model_dump(mode="json") for b in response.content]   # plain dicts to READ
seen.extend(blocks)
narration, answer_blocks = split_turn(blocks)
...yield a "note" for each narration block
...yield a "search" event for each search_calls(blocks)
...yield a "search_result" event for each search_results(blocks)
```

The searches already happened (on Anthropic's side, inside this one API call), so the loop does not *run* anything. It only **reports** what Claude did, as events, so the browser's trail can show it. Because the call is not streamed, all of a step's events arrive together, after the wait. (A streamed version could show "searching for X..." live. That is exercise 1.)

## 2. A turn can pause

```python
if response.stop_reason == "pause_turn":
    append_assistant(messages, response.content)
    continue
```

A server-side search can take a while, and the API will not hold one turn open for ever. When it reaches its limit it stops with `stop_reason: "pause_turn"`: *"I am not finished. Send me back what I have so far and I will carry on."* So:

1. Append the paused assistant content to the conversation, **unchanged**.
2. Call the API again, with **no extra user message**. (Do not add "Continue." The API sees the unfinished server tool request at the end and resumes.)
3. Count it as a step, so `max_steps` still bounds the whole thing.

Forget this branch and a paused turn looks like a finished one: you would show half an answer with no error. (The SDK's own tool-runner helper does exactly this, which is one reason this project writes the loop by hand.)

## 3. Joining a continued turn

The continuation arrives as a *separate response*. If you simply appended it as another assistant message you would have two assistant messages in a row. `append_assistant` makes the history read like one unbroken turn:

```python src="research-buddy/backend/app/agent.py" region="append" title="backend/app/agent.py"
```

```python run src="research-buddy/backend/app/agent.py#append" title="Joining a paused turn" level=easy
messages = [{"role": "user", "content": "population of Pune plus 10 percent"}]

append_assistant(messages, ["text: Searching.", "server_tool_use: web_search('population of pune')"])     # the turn paused here
print("after the paused turn:   ", [(m["role"], len(m["content"]) if isinstance(m["content"], list) else "text") for m in messages])

append_assistant(messages, ["web_search_tool_result: 3 pages", "text: Let me compute.", "tool_use: calculator('7.4 * 1.1')"])   # its continuation
print("after the continuation:  ", [(m["role"], len(m["content"]) if isinstance(m["content"], list) else "text") for m in messages])

messages.append({"role": "user", "content": ["tool_result: 8.14"]})                                   # we answer the calculator
append_assistant(messages, ["text: Pune has 7.4 million...; 10% more is 8.14 million."])               # the final turn: a NEW assistant message
print("after the final turn:    ", [(m["role"], len(m["content"]) if isinstance(m["content"], list) else "text") for m in messages])
print("\nthe single assistant message holds:", messages[1]["content"])
```

```output
after the paused turn:    [('user', 'text'), ('assistant', 2)]
after the continuation:   [('user', 'text'), ('assistant', 5)]
after the final turn:     [('user', 'text'), ('assistant', 5), ('user', 1), ('assistant', 1)]

the single assistant message holds: ['text: Searching.', "server_tool_use: web_search('population of pune')", 'web_search_tool_result: 3 pages', 'text: Let me compute.', "tool_use: calculator('7.4 * 1.1')"]
```

(Real blocks are SDK objects, not strings; the function does not care what is in the list, only that it keeps them in order and unchanged.)

## 4. Your calculator, in the same conversation

```python
client_calls = [b for b in blocks if b["type"] == "tool_use"]
if client_calls:
    append_assistant(messages, response.content)
    ...run each with run_client_tool, yield tool_call / tool_result...
    messages.append({"role": "user", "content": results})
    continue
```

This is the loop you already know, for the **client** tool only. Only blocks of type `tool_use` need an answer. The `server_tool_use` and `web_search_tool_result` blocks in the same message are *already answered*: leave them out of `results`.

:::note A mixed turn
If Claude asks for a search *and* for the calculator in the same group of parallel calls, the API stops with `stop_reason: "tool_use"` and **does not run the search yet**. You return the calculator's result as usual; the search is run on the next request. The loop needs no special case: it answers the `tool_use`, goes round, and the search happens.
:::

## 5. No tool requested: this is the answer

```python
answer, sources = render_answer(answer_blocks or narration)
```

A turn with no `tool_use` and no pause is the final answer. The text after the last tool block becomes the cited answer (lesson 4). The `or narration` is a safety net: if Claude wrote its words *before* its last tool block and nothing after, show those rather than nothing.

## What must never be touched

Look at the three places that put Claude's turn into `messages`: all use `response.content`, the SDK's own block objects, **not** the dicts we made to read them. The encrypted fields inside search results and citations ride along inside those objects, and the API needs them back untouched on the next request (lesson 2). Our readable copies are for reading only.

## Cost has a new line

```python src="research-buddy/backend/app/pricing.py" title="backend/app/pricing.py"
```

Each response's `usage` holds the token counts, and, when a search ran, `usage.server_tool_use.web_search_requests`. The loop adds both up across the steps and `cost_usd` prices them: tokens at the model's rate, plus a cent per search. A failed search is not billed, which is why the code uses the **billed count from `usage`** and not the number of `search` events it saw.

```python run src="research-buddy/backend/app/pricing.py" title="What a question costs" level=easy
for model in ("claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"):
    one = cost_usd(model, 18_000, 2_800, searches=1)
    four = cost_usd(model, 60_000, 4_500, searches=4)
    print(f"{model:<20} one search: ${one:.3f}   four searches: ${four:.3f}   ({four / one:.1f}x)")

print()
print("the same four-search question, split into its parts (opus):")
print(f"   tokens   ${token_cost_usd('claude-opus-5-5', 60_000, 4_500):.3f}")
print(f"   searches ${4 * SEARCH_USD:.3f}")
```

```output
claude-opus-5-5      one search: $0.138   four searches: $0.370   (2.7x)
claude-sonnet-5-5    one search: $0.074   four searches: $0.205   (2.8x)
claude-haiku-5-5     one search: $0.013   four searches: $0.048   (3.7x)

the same four-search question, split into its parts (opus):
   tokens   $0.330
   searches $0.040
```

The token counts in this block are **assumptions** to show the shape, not measurements (your own answers print the real numbers under every reply, so use those). The shape is the lesson: the searches themselves are the *small* part of the bill, a cent each, and the **tokens** are the big part, because Claude reads long search results and every later step re-reads the earlier ones. The context grows with each result, which is why `max_uses` and `max_steps` are both settings, and why a cheaper model is worth trying for research.

## Errors from the whole call

The SDK exceptions (`explain` in `llm.py`) are unchanged, with one that matters here: if web search is **disabled for your organisation**, the request fails with `400 invalid_request_error` saying so. `explain` shows that message to the user (a `BadRequestError`'s own text is safe to show: it comes from the API and says what to fix). That is a failure of the *call*, and nothing like the search *error objects* of lesson 3, which arrive inside a successful response.

:::keypoints
- The loop is the same; the new work is *after* the response: report the searches, handle a pause, answer only `tool_use` blocks.
- `pause_turn` means "carry on": append the content unchanged and call again, with no extra message. Count it as a step.
- Join a continued turn into one assistant message, and always send back the SDK's own block objects (the encrypted fields must survive).
- Server tool blocks are already answered. Only `tool_use` blocks get a `tool_result`.
- Count searches from the response's `usage`, not from the events you saw. A failed search is not billed.
- Cost grows with context, not only with searches: every step re-reads earlier results.
:::

```quiz
? A response has stop_reason "pause_turn". What does the loop do?
- Shows the partial answer
+ Appends the content unchanged and calls the API again, without adding a user message
- Raises an error
> Otherwise a paused turn would look like a finished one.
? Which blocks in a response need a tool_result from you?
- All of them
- Only server_tool_use
+ Only tool_use (your own tools); search blocks are already answered
> Do not answer what the server already answered.
? Why take the number of searches from `usage` rather than from the search events?
+ A failed search is not billed, and `usage` is what the API will actually charge for
- Events are unreliable
- It is shorter
> The bill is the truth.
```

:::exercise Stream the progress
Switch the call to `client.messages.stream(...)` and send a `search` event the moment Claude *starts* a `server_tool_use` block, instead of after the whole response. Which stream events carry the query, and when is it complete? Keep `get_final_message()` for the final blocks you send back. What new failure can happen mid-stream (the connection dropping after two searches), and what should the browser show?
:::
