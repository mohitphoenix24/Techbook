---
title: Streaming the agent's steps
level: intermediate
time: 50
summary: Turn the agent's events into a Server-Sent Events stream, read them in React with the same fetch-and-parse approach as Project 1, and fold them into state with a reducer that keeps each tool call attached to its result. The real reducer replays a whole run in your browser.
tags: SSE, FastAPI, StreamingResponse, reducer, AbortController, events
---

An agent question can take ten seconds or more, with several model calls and database queries along the way. Showing a spinner for that long feels broken. Showing **what is happening** ("looking at the orders table... running a query... drawing a chart") feels like working with a colleague. So the server streams the *process*, and the browser draws it as it arrives.

You met Server-Sent Events in Project 1. This lesson reuses them and focuses on what is new: events that describe **steps**, not only words.

## The server: one function, one stream

SSE is a text format: `event: name`, `data: {json}`, then a blank line.

```python src="data-pilot/backend/app/sse.py" region="format,headers" title="backend/app/sse.py"
```

The route turns each event of the agent into one SSE event:

```python src="data-pilot/backend/app/routes/ask.py" region="events" title="backend/app/routes/ask.py"
```

Three details are worth a pause:

1. **`ask_events` is an async generator.** FastAPI's `StreamingResponse` pulls from it as the client reads, so every `yield` is sent immediately. Nothing is collected into a list first, which is what makes it live.
2. **A fresh `ToolBox` per request.** The tool box remembers the last query result (for `show_chart`). If two people shared one, one person's chart could show the other's data. Per-question state is created per question.
3. **`usage` is injected just before `done`.** The agent reports raw token counts; the *route* knows the model name and turns them into a cost. Prices belong at the edge, not inside the loop.

The route itself is three lines:

```python src="data-pilot/backend/app/routes/ask.py" region="route" title="backend/app/routes/ask.py"
```

and the request is validated before any model is called:

```python src="data-pilot/backend/app/schemas.py" region="ask-request" title="backend/app/schemas.py"
```

Every limit here protects your bill: a question of at most 1,000 characters, at most six past turns, at most ten queries per past turn. The browser also sends the history, so the server stays **stateless**: no sessions, no storage, any instance can answer.

### The events, as the browser sees them

For "How many customers?" the wire looks like this (shortened):

```text
event: turn
data: {"turn": 0}

event: delta
data: {"turn": 0, "text": "Let "}

event: tool_call
data: {"turn": 0, "id": "toolu_mock_1", "name": "run_sql", "input": {"query": "SELECT COUNT(*) ..."}}

event: tool_result
data: {"id": "toolu_mock_1", "name": "run_sql", "ok": true, "summary": "1 rows in 0 ms", "ui": {"type": "table", ...}}

event: turn
data: {"turn": 1}

event: delta
data: {"turn": 1, "text": "There are 60 customers."}

event: usage
data: {"input_tokens": 1420, "output_tokens": 96, "cost_usd": 0.003802}

event: done
data: {"answer": "There are 60 customers.", "queries": ["SELECT COUNT(*) ..."]}
```

## The tests

```python src="data-pilot/backend/tests/test_api.py" region="ask-tests" title="backend/tests/test_api.py"
```

These tests read the stream the way a browser would and assert on the **sequence**: the stream starts with a `turn` and ends with `usage` then `done`; the calls happen in the expected order; the table contains the right people in the right order (checked against the database directly); an unsafe query is blocked **and the data is unchanged**; a follow-up reuses the earlier query. When an agent's behaviour is a sequence of events, testing means checking sequences.

## The browser: parse, then fold

### Reading the stream

```ts src="data-pilot/frontend/src/api.ts" region="ask-stream" title="frontend/src/api.ts"
```

This is the same recipe as Project 1: `fetch` with `POST` (the built-in `EventSource` can only `GET`), read `response.body` as a stream, and parse events with the same small `parseSSE` function, which buffers text and cuts it at blank lines, because network chunks never respect event boundaries.

```ts src="data-pilot/frontend/src/sse.ts" region="parse-stream" title="frontend/src/sse.ts"
```

`askStream` is an **async generator**, so consumers just write `for await (const event of askStream(...))`. Passing an `AbortSignal` lets the user stop a run in the middle.

### Typing the events

```ts src="data-pilot/frontend/src/types.ts" region="types" title="frontend/src/types.ts"
```

`AgentEvent` is a **discriminated union**: the `type` field tells TypeScript which other fields exist. In a `switch (e.type)`, inside `case "tool_result"` the compiler knows `e.ok` and `e.ui` exist, and refuses `e.answer`. Adding a new event to the union makes every `switch` that forgets it a compile error, which is exactly the safety net you want when the protocol grows.

### Folding events into state

Many events, one picture. The state after any event is a pure function of the state before it, so we use a **reducer**:

```ts src="data-pilot/frontend/src/agentReducer.ts" region="state" title="frontend/src/agentReducer.ts"
```

```ts src="data-pilot/frontend/src/agentReducer.ts" region="reducer" title="frontend/src/agentReducer.ts"
```

The design choices, one at a time:

- **A question is a `Turn`** (an exchange: question, steps, answer). Not to be confused with the *model's* turns (calls); `turns` counts those.
- **A `Step` is a tool call whose `result` starts as `null`.** The interface shows a spinner for a step with no result, and fills it in when `tool_result` arrives, matched by `id`. Calls and results are different events but one visual thing.
- **`texts` is keyed by the model's turn number.** The text of a turn that *also called tools* is the model thinking aloud ("Let me look at the tables"). The text of the last turn, which called nothing, is the answer. `answerOf` and `notesOf` split them. While streaming, the newest turn's text shows as the answer until a tool call proves it was only a note, and the interface handles that gracefully.
- **`busy` turns false on `done` or `error`**, which re-enables the input box.
- **`historyOf`** sends back only *finished* turns, so a half-done or failed question does not pollute the next one.

### Watch the real reducer

This block runs the project's actual `agentReducer.ts`, replaying a recorded run event by event. Press **Play** to see steps appear with a spinner, results fill in, notes separate from the answer. **Play and stop** cuts the run short, as if the user pressed Stop.

```tsx run src="data-pilot/frontend/src/agentReducer.ts" title="The real reducer replaying an agent run" level=intermediate autoclick="Play" wait=3200
import { useReducer, useState } from "react";

const table = { type: "table", sql: "SELECT status, COUNT(*) ...", columns: ["status", "orders"], rows: [["delivered", 337]], row_count: 4, truncated: false, ms: 1 } as const;
const E = (event: AgentEvent): Action => ({ type: "event", event });
const SCRIPT: Action[] = [
  { type: "asked", id: "q1", question: "How many orders per status?" },
  E({ type: "turn", turn: 0 }),
  E({ type: "delta", turn: 0, text: "Let me " }), E({ type: "delta", turn: 0, text: "check the table." }),
  E({ type: "tool_call", turn: 0, id: "a", name: "describe_table", input: { table: "orders" } }),
  E({ type: "tool_result", id: "a", name: "describe_table", ok: true, summary: "5 columns", ui: { type: "columns", table: "orders", columns: [] } }),
  E({ type: "turn", turn: 1 }),
  E({ type: "tool_call", turn: 1, id: "b", name: "run_sql", input: { query: "SELECT status ..." } }),
  E({ type: "tool_result", id: "b", name: "run_sql", ok: true, summary: "4 rows in 1 ms", ui: table }),
  E({ type: "turn", turn: 2 }),
  E({ type: "delta", turn: 2, text: "Most orders, " }), E({ type: "delta", turn: 2, text: "337 of 420, " }), E({ type: "delta", turn: 2, text: "were delivered." }),
  E({ type: "usage", input_tokens: 1180, output_tokens: 90, cost_usd: 0.003 }),
  E({ type: "done", answer: "Most orders, 337 of 420, were delivered.", queries: ["SELECT status ..."] }),
];

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [log, setLog] = useState<string[]>([]);

  function play(stopAfter?: number) {
    dispatch({ type: "clear" });
    setLog([]);
    SCRIPT.forEach((action, i) => setTimeout(() => {
      if (stopAfter !== undefined && i > stopAfter) {
        if (i === stopAfter + 1) { dispatch({ type: "stopped" }); setLog((l) => [...l, "stopped  ← the user pressed Stop"]); }
        return;
      }
      dispatch(action);
      const name = action.type === "event" ? action.event.type : action.type;
      setLog((l) => [...l, name]);
    }, 200 * i));
  }

  const t = state.turns[0];
  return (
    <div className="stack">
      <div className="row">
        <button className="primary" onClick={() => play()}>Play</button>
        <button onClick={() => play(7)}>Play and stop</button>
      </div>
      {t && (
        <div className="card">
          <p><b>{t.question}</b> <span className="muted">[{t.status}] · model called {t.turns}×</span></p>
          {t.steps.map((s) => (
            <p key={s.id}>{s.result ? (s.result.ok ? "✓" : "✗") : "…"} <code>{s.name}</code> <span className="muted">{s.result ? s.result.summary : "running"}</span></p>
          ))}
          {Object.entries(notesOf(t)).map(([turn, text]) => <p key={turn} className="muted">note (turn {turn}): {text}</p>)}
          <p>{answerOf(t) || <span className="muted">(no answer yet)</span>}</p>
          {t.usage && <p className="muted">{t.usage.input_tokens + t.usage.output_tokens} tokens · ${t.usage.cost_usd}</p>}
        </div>
      )}
      <pre>{log.join("\n") || "(press Play)"}</pre>
    </div>
  );
}
```

### The hook: the only place that knows both the network and React

```ts src="data-pilot/frontend/src/useAgent.ts" region="ask" title="frontend/src/useAgent.ts"
```

Walk through `ask`:

1. **Abort any run in progress**, so two answers never interleave. The `AbortController` lives in a `useRef`.
2. **Capture `historyOf(state)` before dispatching `asked`**, so the new question is not sent as its own history.
3. **`for await`** dispatches each server event. The reducer decides what it means; the hook has no logic about steps at all.
4. **Abort is not an error.** If the signal was aborted, the user pressed Stop and the run is marked `stopped`. Anything else becomes a friendly message ("Could not reach the server...") instead of a stack trace.

## Reducer tests

```ts src="data-pilot/frontend/src/agentReducer.test.ts" title="frontend/src/agentReducer.test.ts"
```

A reducer is a pure function, so every test is "given these events, expect this state". The interesting cases are the awkward ones: a call with no result yet, the model's notes versus its answer, errors freeing the input box, and only finished turns going back as history.

:::keypoints
- Stream the **process** (turns, text, tool calls and results, usage, done), not just the answer: watching builds trust and hides latency.
- An async generator wrapped in `StreamingResponse` sends each event the instant it is yielded; build one `ToolBox` per request.
- Cost belongs at the edge: the route converts tokens to money, the loop only counts tokens.
- Type events as a discriminated union; the compiler then checks every `switch`.
- A reducer folds events into state: a `Step` starts with `result: null` and is completed by the matching `tool_result`.
- Text from a turn that called tools is a note; text from the last turn is the answer.
- Abort means stopped, not failed. Keep the server stateless by sending history from the browser.
:::

```quiz
? Why does each request create a new ToolBox?
- It is faster
+ It remembers the last result for show_chart, and that state must not be shared between users
- The tools change every time
> Per-request objects keep one person's data out of another's answer.
? In the reducer, why does a Step start with result: null?
- A bug in the design
+ The call event arrives before the tool finishes; the interface shows it as running until the matching result arrives
- Results are optional
> Two events describe one visual thing; matching by id joins them.
? The user presses Stop. Which is correct?
- Show an error message
+ Mark the run as stopped; an aborted fetch is a user choice, not a failure
- Retry automatically
> Distinguish cancelling from failing: only failures deserve an error message.
```

:::exercise A new event
Add a `thinking` event: the server sends `{"type": "thinking", "text": "..."}` whenever the model's reasoning is available. On the server, emit it from the agent (invent a text for the offline planner). In the browser, extend the `AgentEvent` union and let TypeScript show you every `switch` that no longer compiles. Store the text and show it in a collapsible block. Which files did you touch, and which of them did the compiler point out?
:::
