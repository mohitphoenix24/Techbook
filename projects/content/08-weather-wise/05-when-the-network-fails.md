---
title: When the network fails
level: easy
time: 40
summary: Timeouts, outages, rate limits, rejected requests and replies that are not what you expected. Every one becomes a result the model can read and act on, with advice on whether to retry. The failure handling runs for real against a port where nothing is listening.
tags: error handling, timeouts, rate limits, retries, resilience, tool results
---

A tool that calls the internet will fail, sometimes for reasons that have nothing to do with you. What matters is what your agent does next. There are three possible answers:

1. **Crash.** The user sees a stack trace. The worst outcome.
2. **Hide it.** The tool returns nothing, or a made-up value, and the agent carries on as if it worked. This is worse than crashing, because the answer *looks* fine. (A weather agent that invents a forecast when the service is down is a liability.)
3. **Say so, usefully.** The tool returns an error message that tells the model **what happened** and **what to do about it**, and the model tells the person honestly. This is the goal.

## The failures, and what the model should be told

| What happened | Message to the model | Retry? |
|---|---|---|
| The service took too long (timeout) | "took too long to answer. You may try once more." | once |
| No connection at all (DNS, offline, refused) | "Could not reach the weather service. Tell the user it is unavailable right now." | no |
| `429 Too Many Requests` | "asking too often. Do not retry; tell the user to try again in a minute." | **no** |
| `5xx` (their server broke) | "had a problem (HTTP 503). You may try once more." | once |
| `4xx` (we sent something wrong) | "rejected the request: Latitude must be in range of -90 to 90" | no: fix the input |
| `200` but the body is not JSON | "sent a reply that could not be read. You may try once more." | once |
| `200`, valid, but no results | "No place called 'Qwertyxyzz' was found. Check the spelling..." | with a new input |

Each message is written for the model. "You may try once more" and "Do not retry" are *instructions about the next move*, and that is what turns a failure into a decision instead of a loop. A rate limit is the clearest case: if the tool just said "error", a keen model would retry at once and make it worse.

## One function that owns every failure

```python src="weather-wise/backend/app/weather.py" region="fetch" title="backend/app/weather.py"
```

All the network code goes through `_get`. It catches the library's exceptions (`TimeoutException` is a kind of `HTTPError`, so it is caught first, because the more specific case must come first), looks at the status code, and tries to read the body. Every failure leaves as a **`WeatherError`**: one exception type, with a message that is already written for the model. The rest of the code deals with one kind of failure.

`ToolBox.call` is the safety net:

```python src="weather-wise/backend/app/tools.py" region="toolbox" title="backend/app/tools.py"
```

Read the `except` ladder at the bottom of `call`. `ValidationError` (the model sent bad input) and `WeatherError` (the world misbehaved) each become a `ToolResult` with `ok=False`. And the last, broad `except Exception` is a **last resort**: a bug of ours, or a reply shaped differently than we assumed, still becomes "the tool failed unexpectedly", is logged for us to find, and **does not leak the internals** to the model (a stack trace in a tool result is both noise and a small security leak). The promise in the docstring, "nothing here raises", is now true for *any* input.

:::note A promise needs a test
It is easy to write "nothing raises" in a docstring. The test file has a test for each way this could break: a body that is not JSON, and a function that throws `KeyError`. Both come out as `ok=False` results. (An earlier draft of this project handled the status codes but not a non-JSON `200`. Writing this lesson is how that gap was found, which is a good reason to write down the table above for every tool you build.)
:::

## Watch a failure happen

Nothing is listening on port 9 of your own computer, so a request to it fails immediately with "connection refused": a real network failure, with no pretending. This block runs the real `ToolBox` and sends it the two kinds of bad input and one kind of bad luck:

```python local verify cwd="weather-wise/backend" title="A real failure, handled"
import asyncio

import httpx

from app.tools import ToolBox


async def main():
    async with httpx.AsyncClient(timeout=2) as http:
        box = ToolBox(http, geocoding_url="http://127.0.0.1:9/v1/search")          # nothing listens there
        for name, args in [
            ("find_place", {"name": "Pune"}),                  # the service is unreachable
            ("find_place", {"name": ""}),                      # the model sent bad input
            ("get_forecast", {"place_id": 1259229}),           # an id that was never found
        ]:
            r = await box.call(name, args)
            print(f"{name}({args})")
            print(f"   ok={r.ok}  summary={r.summary!r}")
            print(f"   the model reads: {r.content}\n")


asyncio.run(main())
```

```output
find_place({'name': 'Pune'})
   ok=False  summary='weather service problem'
   the model reads: Error: Could not reach the weather service. Tell the user it is unavailable right now.

find_place({'name': ''})
   ok=False  summary='invalid input'
   the model reads: Error: invalid input. name: String should have at least 1 character. Fix the input and try again.

get_forecast({'place_id': 1259229})
   ok=False  summary='unknown place id'
   the model reads: Error: unknown place id 1259229. Call find_place first and use an id it returned.
```

None of the three raised. And notice that two of them never touched the network at all: **validation is the cheapest failure handling there is**.

## How the person sees it

`summary` is what the step list shows ("weather service problem"), `content` is what the model reads. The model then writes the honest sentence: "I couldn't reach the weather service just now. Please try again in a minute." Try it yourself: turn off your Wi-Fi after the page has loaded and ask about the weather. (You will see the *Claude* call fail first, with its own plain message from `llm.py`: "Could not reach the Anthropic API". To fail only the weather side, change `GEOCODING_URL` in `weather.py` to the dead port above and restart.)

## Timeouts matter more than they seem

`main.py` creates the HTTP client with `timeout=settings.weather_timeout_seconds` (8 seconds by default). Without a timeout a stalled connection can hang for minutes, the model waits, the user waits, and the stream shows "running..." for ever. **Every call that leaves your machine needs a timeout.** (The Anthropic SDK has one too: ten minutes by default, which you can shorten with the client's `timeout` option.)

Retries need the same care: the model may retry, and the SDK already retries Claude calls on `429` and `5xx`. Two layers of retries multiply. That is why the messages say "once".

:::keypoints
- A tool that calls the internet will fail. Decide the behaviour: not crash, not hide, but say so usefully.
- Turn every failure into a result written for the model: what happened, and whether to retry.
- Funnel all network failures through one function that raises one exception type.
- Add a last-resort `except Exception`: log it for yourself, give the model a bland message, never leak internals.
- Always set a timeout. Retry at most once, and never on a rate limit.
- Validation is the cheapest failure handling: it needs no network.
:::

```quiz
? A weather request returns 429 Too Many Requests. What should the message to the model say?
- "Error."
+ That we are asking too often: do not retry, and tell the user to try again in a minute
- "Try again immediately"
> Telling the model not to retry stops it from making a rate limit worse.
? Why catch `httpx.TimeoutException` before `httpx.HTTPError`?
+ A timeout is a kind of HTTPError, and the more specific case must come first
- They are unrelated
- To make the code shorter
> With a general `except` first, the specific one would never run.
? What should a tool do when the service is down?
- Make up a plausible forecast
- Raise an exception
+ Return a clear error result so the agent can tell the user honestly
> Hiding a failure is worse than showing it.
```

:::exercise Retry once
Add a single automatic retry inside `_get` for timeouts and `5xx` replies (but never for `429` or `4xx`), with a short pause (`await asyncio.sleep(0.5)`). Write a test using a server you control: start a tiny `asyncio` server on a free port that fails the first request and succeeds the second. Why is it better to retry here, where you can see the status, than to leave it to the model?
:::
