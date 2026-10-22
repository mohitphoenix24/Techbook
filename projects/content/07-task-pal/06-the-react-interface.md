---
title: The React interface
level: easy
time: 45
summary: Fold the agent's stream of events into a conversation with one reducer, show every step as it happens, and keep a task board in step with the agent. The real reducer, step list and board run in your browser, driven by events you play one at a time.
tags: React, TypeScript, reducer, useReducer, SSE client, state
---

The server streams *events* (lesson 5). The browser has to turn that stream into something a person understands: a question, a list of steps that fill in as tools finish, an answer, a cost. The tool for that is the same one Pocket Chat used: a **reducer**.

## The events, as types

```ts src="task-pal/frontend/src/types.ts" region="types" title="frontend/src/types.ts"
```

`AgentEvent` is a *discriminated union*: every member has a `type` string, and TypeScript narrows on it. Inside `case "tool_result":` the compiler knows `e.changed` exists; inside `case "done":` it knows `e.answer` does. A new event type added to the union makes every `switch` that forgets it a compile error. That is the point of typing the stream.

:::warn A type is a promise, not a check
`JSON.parse(data) as AgentEvent` tells the compiler to believe us. If the server sends something else, the compiler will not notice at run time. That is acceptable between two halves of one project that you control and test together. For a third-party API, validate at the edge (with a library such as Zod).
:::

## Reading the stream

```ts src="task-pal/frontend/src/api.ts" region="chat-stream" title="frontend/src/api.ts"
```

`EventSource`, the browser's built-in SSE client, can only send `GET` requests, and a chat must `POST` its message. So `chatStream` uses `fetch`, reads the body as a stream, and hands it to `parseSSE`, a small parser that cuts the text at blank lines. Network chunks do not respect event boundaries (one chunk can hold half an event, or three), which is why `sse.ts` keeps a buffer and has its own tests. `chatStream` is an **async generator**: the caller writes `for await (const event of chatStream(...))` and gets events one at a time, and `abort()` on the signal ends the loop.

## The reducer

The state of the conversation is a list of *exchanges*: one per question, each with its steps, its answer and its status.

```ts src="task-pal/frontend/src/chatReducer.ts" region="state" title="frontend/src/chatReducer.ts"
```

```ts src="task-pal/frontend/src/chatReducer.ts" region="reducer" title="frontend/src/chatReducer.ts"
```

The shape of `apply` is the whole interface in miniature:

- `tool_call` adds a step whose `result` is `null`. **`null` means "still running"**, and the step list draws a pulsing dot for it.
- `tool_result` finds that step **by id** and fills in the result. By id, not by position, because (as WeatherWise will show) results can arrive in any order.
- `note` is held in `pendingNote` until the next `tool_call`, which takes it. That is how "I'll check today's date first." ends up above the right step.
- `done` and `error` end the run. The outer `reducer` also sets `busy: false` on both, so the Send button always comes back.

Because a reducer is a **pure function** (same state and action in, same state out, no network, no clock), testing it takes no browser. The tests feed it a list of events and compare the result, and they cover the awkward cases: two calls running at once, an error after some steps, Stop, and how much history is sent back.

## The hook

```ts src="task-pal/frontend/src/useChat.ts" region="send" title="frontend/src/useChat.ts"
```

`send` builds the history from finished exchanges, dispatches `asked`, then loops over the stream and dispatches each event. Three details:

- **`onChanged()` runs for every `tool_result` that has `changed: true`**, so the task board reloads *while the agent is still working*. You see the task appear before the answer arrives. A final `onChanged()` in `finally` makes sure the board is right even after an error or a Stop.
- **An `AbortController`** is how Stop works: `stop()` aborts, `fetch` throws, and the `catch` tells an abort (`stopped`) from a network failure (`failed`).
- Sending a new message first aborts any run still in flight, so two answers can never interleave.

## The board

```tsx src="task-pal/frontend/src/components/TaskBoard.tsx" region="board" title="frontend/src/components/TaskBoard.tsx"
```

`groupTasks` (in `format.ts`, with tests) sorts tasks into Overdue, Today, Upcoming, No date and Done, and leaves empty groups out. The date maths is done on `YYYY-MM-DD` strings in UTC (`daysBetween`), never with local `Date` arithmetic, because daylight-saving changes and time zones make "midnight" a trap. A test checks that two dates across a clock change are still exactly two days apart.

```ts src="task-pal/frontend/src/format.ts" region="groups" title="frontend/src/format.ts"
```

## The steps

```tsx src="task-pal/frontend/src/components/StepList.tsx" region="steps" title="frontend/src/components/StepList.tsx"
```

The agent's work is *visible*. This is not decoration. A person who can see "Looked at your list, Added a task: Call mum, due 2026-10-23" can catch a wrong date before it matters, and learns to trust (or distrust) the agent from evidence. **Showing the steps is the cheapest safety feature an agent can have.**

## Watch it work

This block runs the project's **real** `chatReducer`, `StepList`, `ExchangeView` and `TaskBoard`. The events are typed in by hand, in the order the server would stream them for *"Remind me to call mum on Friday, high priority"* (no model is involved here; this is the interface alone). Press **Play next event** to feed them in one at a time and watch the steps fill in and the board change.

```tsx run src="task-pal/frontend/src/format.ts,task-pal/frontend/src/chatReducer.ts,task-pal/frontend/src/components/StepList.tsx,task-pal/frontend/src/components/ExchangeView.tsx,task-pal/frontend/src/components/TaskBoard.tsx" flat title="The real interface, one event at a time" level=easy autoclick="Play next event"
import { useReducer, useState } from "react";

const css = `
:root{--panel:var(--card);--bad:var(--danger);--bad-bg:rgba(220,38,38,.12);--muted:var(--text-dim,#64748b);--radius:12px}
.demo{display:grid;grid-template-columns:minmax(0,260px) minmax(0,1fr);gap:16px}@media(max-width:640px){.demo{grid-template-columns:1fr}}
.board{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:12px}.board h2{font-size:15px;margin:0 0 6px}.empty{font-size:13px}
.group{margin-top:10px}.group h3{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0}.count{margin-left:6px;opacity:.7}
.group ul{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.task{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;align-items:center;background:var(--bg);border:1px solid var(--border);border-left:4px solid var(--border);border-radius:10px;padding:6px 10px}
.task.p-high{border-left-color:var(--bad)}.task .meta{grid-column:2;display:flex;gap:10px;font-size:12px;color:var(--muted)}.flag-high{color:var(--bad);text-transform:uppercase;font-size:11px}.task .id{margin-left:auto}
.question{margin-left:auto;width:fit-content;max-width:100%;background:color-mix(in srgb,var(--accent) 14%,var(--bg));border-radius:12px;padding:8px 14px;font-weight:500}
.trace{margin-top:12px;border:1px solid var(--border);border-radius:12px;background:var(--panel)}.trace summary{padding:8px 14px;cursor:pointer;font-weight:600;font-size:13.5px;color:var(--muted)}
.steps{list-style:none;margin:0;padding:0 12px 12px;display:flex;flex-direction:column;gap:8px}
.step{background:var(--bg);border:1px solid var(--border);border-left:4px solid var(--muted);border-radius:10px;padding:8px 12px}
.step.ok{border-left-color:var(--ok)}.step.running{border-left-color:var(--accent)}
.step .note{margin:0 0 6px;font-style:italic;color:var(--muted);font-size:14px}.step .head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:14px}
.step .head code{color:var(--muted)}.step .status{margin-left:auto;font-size:12.5px;color:var(--muted)}.step .dot{width:8px;height:8px;border-radius:50%;background:var(--muted)}
.step.ok .dot{background:var(--ok)}.step.running .dot{background:var(--accent)}
.answer{margin:12px 0 4px;font-size:16px}.thinking{margin:10px 0}.usage{font-size:12px}.muted{color:var(--muted)}
`;

const iso = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return localToday(d); };
const friday = iso(5);
const EVENTS: { event: AgentEvent; tasks?: Task[] }[] = [
  { event: { type: "step", step: 0 } },
  { event: { type: "note", step: 0, text: "I'll check today's date first." } },
  { event: { type: "tool_call", step: 0, id: "t1", name: "get_today", input: {} } },
  { event: { type: "tool_result", id: "t1", name: "get_today", ok: true, summary: "today", changed: false } },
  { event: { type: "step", step: 1 } },
  { event: { type: "tool_call", step: 1, id: "t2", name: "add_task", input: { title: "Call mum", due: friday, priority: "high" } } },
  { event: { type: "tool_result", id: "t2", name: "add_task", ok: true, summary: "added #1", changed: true },
    tasks: [{ id: 1, title: "Call mum", due: friday, priority: "high", done: false }] },
  { event: { type: "step", step: 2 } },
  { event: { type: "done", answer: "Done. I added Call mum for Friday, marked high priority.", steps: 3, usage: { input_tokens: 2210, output_tokens: 190, cost_usd: 0.0127 } } },
];
const asked = () => reducer(initialState, { type: "asked", id: "q1", question: "Remind me to call mum on Friday, high priority" });

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, asked);
  const [n, setN] = useState(0);
  const tasks = [...EVENTS.slice(0, n)].reverse().find((e) => e.tasks)?.tasks ?? [];
  const next = () => { if (n < EVENTS.length) { dispatch({ type: "event", event: EVENTS[n].event }); setN(n + 1); } };
  const reset = () => { dispatch({ type: "clear" }); dispatch({ type: "asked", id: "q1", question: "Remind me to call mum on Friday, high priority" }); setN(0); };
  return (
    <div className="stack">
      <style>{css}</style>
      <div className="row">
        <button className="primary" onClick={next} disabled={n >= EVENTS.length}>Play next event</button>
        <button onClick={reset}>Start again</button>
        <span className="muted">{n}/{EVENTS.length} events · last: <code>{n ? EVENTS[n - 1].event.type : "none"}</code> · busy: <code>{String(state.busy)}</code></span>
      </div>
      <div className="demo">
        <TaskBoard tasks={tasks} onToggle={() => {}} loading={false} />
        <div>{state.exchanges.map((x) => <ExchangeView key={x.id} x={x} />)}</div>
      </div>
    </div>
  );
}
```

Play the events slowly and watch three things: the step appears with a pulsing dot **before** its result; the task appears on the board at the `tool_result` that says `changed: true`, not at the end; and the usage line shows up only with `done`.

## Run it for real

Back on your computer, with the app running and a key in `.env`, add a task and watch the *same* components do this with real events. Then press **Stop** in the middle of a request: the steps stop growing, "⏹ Stopped." appears and the Send button comes back, because `stopped` is just another action for the reducer.

## Tests

```ts src="task-pal/frontend/src/chatReducer.test.ts" region="reducer-tests" title="frontend/src/chatReducer.test.ts"
```

The reducer tests are the interface's regression net: they pin down a tool shown running then finished, the note going to the first call only, the end states, Stop and failure, and the history limit. `format.test.ts` does the same for dates, grouping and the inline-text splitter. Run them with `npm test`; `npm run build` type-checks everything.

:::keypoints
- A reducer folds a stream of events into UI state. It is a pure function, so it is tested without a browser.
- `result: null` means "still running". Match results to steps by **id**, never by position.
- Type the events as a discriminated union: the compiler then checks every `switch`.
- Refresh the board on each change the agent makes, not only at the end, so the interface follows the agent.
- Showing every step is the cheapest safety feature an agent can have.
- Do date arithmetic on `YYYY-MM-DD` strings in UTC, never with local `Date` maths.
:::

```quiz
? Why does the reducer match a `tool_result` to its step by id and not by "the last step"?
- IDs are shorter
+ Several tools can be running at once, and their results may arrive in any order
- Position is not available
> Id matching is correct whatever the order; "the last one" is only correct by luck.
? What does `result: null` on a step mean?
- The tool failed
+ The tool is still running
- The tool returned nothing
> The step list draws a pulsing dot for it until the result arrives.
? Why does `useChat` call `onChanged()` for each `tool_result` with `changed: true`?
- To save the conversation
+ So the task board updates while the agent is still working
- To count tokens
> The interface should follow the agent step by step, not jump at the end.
```

:::exercise Show the input
The step list shows `describeInput(...)` for each tool. Extend it to show the *result text* of `list_tasks` when you click a step (you will need the server to send it: which event and which field?). Think about what you would have to bound, and why you must not dump a huge result into the page.
:::
