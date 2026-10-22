---
title: Reading the search response
level: easy
time: 45
summary: Pull a mixed list of blocks apart with plain functions on dictionaries. Which text is narration and which is the answer, what searches were made and what they found, why an error is an object and not an exception, and how a paused turn splits one search across two responses. All of it runs in your browser.
tags: response parsing, content blocks, server_tool_use, web_search_tool_result, pure functions, errors
---

Lesson 2 showed that a response is a list of blocks of different kinds. The loop and the interface need three questions answered about it:

1. **Which text is the answer, and which is narration?**
2. **What searches did Claude make, and what did they find?**
3. **Did anything go wrong?**

All three are answered by functions in `research.py` that take **plain dictionaries** (the blocks, as JSON) and return plain data. No network, no SDK objects. That keeps them easy to read, easy to test, and runnable right here.

## Narration and answer

When Claude searches, it often writes a sentence first ("I'll search for when Claude Shannon was born."). That sentence is not the answer. The answer is what Claude writes *after* it has read the results.

```python src="research-buddy/backend/app/research.py" region="split" title="backend/app/research.py"
```

`split_turn` finds the position of the **last tool block** (a search request, a search result, or a `tool_use`). Text before it is *narration*, shown as a note; text after it is the *answer*. If there is no tool block at all, everything is the answer (Claude replied directly).

## Searches and their results

```python src="research-buddy/backend/app/research.py" region="searches" title="backend/app/research.py"
```

- `search_calls` lists the requests: `{id, query}` for every `server_tool_use` named `web_search`.
- `search_results` lists what came back for each id. Notice the branch: **an error is one object, not a list.** When a search fails (the limit was reached, the service is busy), the API still answers `200 OK`, and the `web_search_tool_result` has a `content` that is a *single error object* with an `error_code`, instead of a list of results. Code that assumes a list will crash on the one response that matters. So `isinstance(content, dict)` comes first, and each code is mapped to a sentence in `SEARCH_ERRORS` (an unknown code, from a newer API, still gets a message).
- A search that succeeds but finds nothing is an **empty list**, which is *not* an error.
- `searches_in` joins calls and results by id, and it works over **any number of responses together**, which matters in the next lesson (a paused turn can hold a search in one response and its results in the next).

:::warn Server tool errors do not raise
A failed *search* is not an HTTP error and not an exception in the SDK. It is data inside a successful response. The SDK's `except anthropic.APIError` will never see it. Your code has to look. (The failure of the *whole call*, such as web search being disabled for the organisation, is different: that is a `400`, and the SDK raises.)
:::

## Try it

The block below runs the real functions on a response written to match the documented shape. The shape lives in `tests/shapes.py` (plain data, used by the tests; no model is involved). It first reads a normal search turn, then three trickier ones.

```python run src="research-buddy/backend/app/research.py,research-buddy/backend/tests/shapes.py" flat title="Taking a response apart" level=easy
blocks = SHANNON["content"]
print("block types, in order:")
print("  ", [b["type"] for b in blocks])

narration, answer = split_turn(blocks)
print("\nnarration:", [b["text"] for b in narration])
print("answer   :", "".join(b["text"] for b in answer))

print("\nsearches made:", search_calls(blocks))
[found] = search_results(blocks)
print("what the search found:")
for r in found["results"]:
    print(f"   {r['title']:<34} {r['url']}  age={r['age']}")

print("\n--- a search that failed (HTTP 200, an error OBJECT):")
failed_turn = message([search("s1", "gold price"), failed("s1", "max_uses_exceeded")])["content"]
print("  ", search_results(failed_turn))

print("\n--- a search that found nothing (an empty LIST, not an error):")
empty_turn = message([search("s1", "qwertyzz"), {"type": "web_search_tool_result", "tool_use_id": "s1", "content": []}])["content"]
print("  ", search_results(empty_turn))

print("\n--- a paused turn: the search is in one response, its results in the next:")
first = message([text("Searching."), search("s1", "gold price today")], stop_reason="pause_turn")["content"]
second = message([results("s1", ("https://example.com/gold", "Gold today", None)), text("Gold is X.")])["content"]
print("   results in the first response:", search_results(first))
print("   both responses together      :", [(s["query"], len(s["results"])) for s in searches_in(first + second)])
```

```output
block types, in order:
   ['text', 'server_tool_use', 'web_search_tool_result', 'text', 'text', 'text', 'text']

narration: ["I'll search for when Claude Shannon was born."]
answer   : Based on the search results, Claude Shannon was born on April 30, 1916, in Petoskey, Michigan. He is called the father of information theory.

searches made: [{'id': 'srvtoolu_1', 'query': 'claude shannon birth date'}]
what the search found:
   Claude Shannon - Wikipedia         https://en.wikipedia.org/wiki/Claude_Shannon  age=April 30, 2025
   Claude Shannon | Britannica        https://www.britannica.com/biography/Claude-Shannon  age=None

--- a search that failed (HTTP 200, an error OBJECT):
   [{'id': 's1', 'ok': False, 'error': 'The search limit for this question was reached.'}]

--- a search that found nothing (an empty LIST, not an error):
   [{'id': 's1', 'ok': True, 'results': []}]

--- a paused turn: the search is in one response, its results in the next:
   results in the first response: []
   both responses together      : [('gold price today', 1)]
```

## Plain dictionaries, real types

In the running app the blocks come from the SDK as typed objects (`TextBlock`, `ServerToolUseBlock`, ...). The loop turns each into a plain dict with `b.model_dump(mode="json")` before handing it to these functions, and keeps the **original objects** for the next request (the ones with the encrypted fields, untouched). The tests check the join: they build the SDK's own `Message` from the documented JSON and feed its dumped blocks to the same functions, so the code is proven against the SDK's types as well as against dictionaries.

```python src="research-buddy/backend/tests/test_research.py" region="search-tests" title="backend/tests/test_research.py"
```

The pause test, the failed-search test and the "error code we do not know" test are all here. When your code reads a format someone else controls, **test the odd shapes**: the error that is an object, the empty list, the missing key, the code that does not exist yet.

:::keypoints
- A response with tools is a list of mixed blocks. Read it with small pure functions on dicts.
- The text after the last tool block is the answer; text before it is narration.
- A failed search is a normal `200` response whose result `content` is **one error object**, not a list. Check the type before you index.
- An empty result list is not an error.
- A search can be split across two responses (a paused turn): join by id across all responses.
- Dump SDK blocks to dicts to read them, and keep the originals to send back.
:::

```quiz
? A web_search_tool_result has `content` that is a single object with an error_code. What happened?
- The HTTP request failed
+ The search failed, inside an otherwise successful response; no exception is raised
- Claude refused
> Server tool errors are data, not exceptions. Branch on the type of `content`.
? Which text is the answer?
- All of it
- The first block
+ The text after the last tool block; text before it is narration
> This is how `split_turn` decides.
? Why does searches_in work over several responses at once?
- For speed
+ A paused turn can hold the search request in one response and its results in the next
- The API sends searches twice
> Joining by id across responses gives the full picture.
```

:::exercise A new error
The API adds a new error code, `region_blocked`. What does your code show the user today, and why is that already acceptable? Then add a friendly message for it to `SEARCH_ERRORS` and a test, and explain why the unknown-code test should keep passing.
:::
