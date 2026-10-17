---
title: The agent desk
level: advanced
time: 60
summary: The React interface agents actually use. A sign-in gate, an inbox, a ticket view that streams the pipeline, a draft panel with citation chips, guardrail results and role-aware buttons, and a trace waterfall. Built from small pure modules plus thin components, with the server's list of allowed actions as the only source of truth. The real components run in your browser.
tags: React, TypeScript, reducers, accessibility, human in the loop, UX
---

The best pipeline is wasted if the person using it cannot see what it did, trust it, and correct it quickly. A support agent has maybe a minute per ticket. The interface has to make four things obvious: *what the customer wants*, *what the copilot decided and why*, *whether the draft is safe*, and *what I can do next*.

![The desk: inbox on the left; the ticket with its triage, the pipeline stages and the draft with citation chips on the right](assets/img/support-pilot-draft.png)

## The shape of the front end

```text
App                      who is signed in, which tab, the inbox filters
 +- Login                two demo sign-ins
 +- Inbox                search, status filters, priority dots, status badges
 +- TicketView           one ticket: loads it, runs the copilot, performs actions
 |   +- Pipeline         the stages as they stream in (state from a reducer)
 |   +- DraftPanel       the draft, citation chips, edit / approve / reject / send
 |   |   +- Checks       the guardrail results
 |   +- TracePanel       the waterfall (lesson 11)
 +- MetricsView          team leads only
 +- IntakeForm           the customer's side, no sign-in
```

As in the earlier projects, the rule is: **put logic in small pure modules, keep components thin.** The pure modules are tested with no browser: `pipelineReducer.ts`, `citations.ts`, `waterfall.ts`, `format.ts`, `session.ts`.

## Types first

```ts src="support-pilot/frontend/src/types.ts" region="types" title="frontend/src/types.ts"
```

Two types do most of the work. `Ticket` carries **`actions: string[]`**: the buttons the server says this person may press. And `PipelineEvent` is a *discriminated union*: the compiler knows that `{type: "delta"}` has `text` and `{type: "draft"}` has a `draft`, and refuses code that mixes them up. Add an event on the server and update this union, and TypeScript lists every `switch` that needs a new branch.

## Talking to the server

```ts src="support-pilot/frontend/src/api.ts" region="client" title="frontend/src/api.ts"
```

Two habits keep the rest of the code simple:

- **One `request` function** adds the `Authorization` header and turns every failure into an `ApiError` with a status, a machine code and a human message. The server always answers errors as `{detail: {code, message}}`, so components show `err.message` and never parse responses.
- A network failure becomes a *friendly* error ("Is the backend running?"), not a raw `TypeError: Failed to fetch`.

The streaming call reuses the SSE parser from Project 1:

```ts src="support-pilot/frontend/src/api.ts" region="process-stream" title="frontend/src/api.ts"
```

## Folding the stream into state

Events arrive as the pipeline runs: a stage starts, finishes, words stream in, a revision resets the draft, an error or the end. A reducer folds them into one picture:

```ts src="support-pilot/frontend/src/pipelineReducer.ts" region="reducer" title="frontend/src/pipelineReducer.ts"
```

- A stage is **running** when it starts and **done** with a summary and a time when it finishes; stages that only report at the end (decide, retrieve) are simply added as done.
- `delta` appends to `text`. **`reset` clears it**, for the moment the copilot rewrites a failed draft. Without `reset`, the second draft would be appended to the first.
- An `error` marks every stage that was still running as failed, so no spinner is left spinning.

Here is the real reducer and the real `Pipeline` component replaying a recorded run. Press **Normal run** or **With a rewrite**.

```tsx run src="support-pilot/frontend/src/pipelineReducer.ts,support-pilot/frontend/src/waterfall.ts,support-pilot/frontend/src/components/Pipeline.tsx" flat title="The real reducer and Pipeline view replaying a run" level=intermediate autoclick="With a rewrite" wait=3200
import { useReducer, useState } from "react";

const S = (name: string, summary: string, ms: number): PipelineEvent => ({ type: "stage", name, status: "done", summary, ms });
const start = (name: string): PipelineEvent => ({ type: "stage", name, status: "start" });
const words = (text: string): PipelineEvent[] => text.split(" ").map((w) => ({ type: "delta", text: w + " " }) as PipelineEvent);
const trace = { spans: 9, duration_ms: 4600, cost_usd: 0.009, tokens: 3200, errors: 0, stages: ["ticket"] };

const NORMAL: PipelineEvent[] = [
  start("redact"), S("redact", "2 personal detail(s) hidden", 3), start("triage"), S("triage", "damaged, high priority, negative", 612), S("lookup", "order AUR-1005 (delivered)", 4),
  S("decide", "refund: inside the 30-day window", 1), S("retrieve", "damaged, refunds-timeline", 2), start("draft"),
  ...words("Hi Meera, I am sorry about this. We can refund ₹12,999 [kb:damaged]."), S("draft", "62 words", 1700), S("check", "all checks passed", 2), { type: "done", status: "needs_lead", trace },
];
const REWRITE: PipelineEvent[] = [
  start("redact"), S("redact", "nothing to hide", 1), start("triage"), S("triage", "refund, normal priority, neutral", 540), S("lookup", "order AUR-1001 (delivered)", 3), S("decide", "refund: inside the 10-day window", 1), start("draft"),
  ...words("We guarantee this will be sorted within minutes, 100%."), S("draft", "55 words", 1500), S("check", "1 blocking problem", 2),
  start("revise"), { type: "reset" }, ...words("Hi Asha, we can refund ₹4,499 to your original payment method [kb:returns]."), S("revise", "50 words", 1400), S("check", "all checks passed", 2), { type: "done", status: "drafted", trace },
];

export default function App() {
  const [run, dispatch] = useReducer(runReducer, idle);
  const [log, setLog] = useState("");

  function play(events: PipelineEvent[]) {
    dispatch({ type: "start" });
    setLog("");
    events.forEach((event, i) => setTimeout(() => { dispatch({ type: "event", event }); if (event.type === "reset") setLog("reset: the first draft is cleared"); }, 70 * i));
  }

  return (
    <div className="stack">
      <div className="row"><button onClick={() => play(NORMAL)}>Normal run</button><button className="primary" onClick={() => play(REWRITE)}>With a rewrite</button></div>
      <style>{`.pipeline{border:1px solid var(--border);border-radius:12px;padding:12px 14px;background:var(--card)}.pipeline ol{list-style:none;margin:0;padding:0}.stage{display:grid;grid-template-columns:22px 1fr auto;gap:8px}.stage .mark{color:var(--ok);font-weight:700}.live{margin:10px 0 0;padding:8px 12px;border-left:3px solid var(--accent)}.small{font-size:13px}.problem{color:var(--danger)}`}</style>
      <Pipeline run={run} />
      <p className="muted">{run.phase === "done" ? `finished: ${run.cost} dollars, final text: "${run.text}"` : run.phase === "idle" ? "(press a button)" : "running…"} {log}</p>
    </div>
  );
}
```

Watch the rewrite: the first draft streams ("We guarantee..."), the checks fail, the stage list shows the **revise** step, the text is cleared, and a second draft takes its place. Nothing in the component *knows* about rewrites: it draws `run.stages` and `run.text`, and the reducer did the rest.

## The draft panel

The most important component, because it is where a person decides.

```tsx src="support-pilot/frontend/src/components/DraftPanel.tsx" region="draft" title="frontend/src/components/DraftPanel.tsx"
```

What to notice:

- **Buttons come from `actions`.** `can("approve")`, `can("send")`: if the server did not list it, there is no button. The panel contains no rules about roles or states.
- **The policy decision is shown beside the draft**, with "Team lead must approve" when relevant. The person sees *what was decided and why* before reading the prose.
- **Citations are chips.** The text is cut into plain parts and `[kb:...]` markers by a pure function, and each chip is coloured valid or invalid depending on whether that article was provided to the model.
- **Two plain-language notes** explain a missing button: "A team lead has to approve it" and "A guardrail check is failing". A hidden button without a reason is a support ticket of its own.
- **Editing is explicit**: Edit, change, "Save and re-check". The server runs the guardrails again and the panel remounts on the new version (`key={draft.version}`).
- **Rejecting asks for a reason**, which goes into the audit log.

```ts src="support-pilot/frontend/src/citations.ts" region="citations" title="frontend/src/citations.ts"
```

```tsx src="support-pilot/frontend/src/components/Checks.tsx" region="checks" title="frontend/src/components/Checks.tsx"
```

`Checks` never uses colour alone: each row has a symbol (✓, ✕, !) and a visually hidden word ("passed", "failed, blocks approval", "warning") for screen readers.

### Try the real panel

Three situations, with the real `DraftPanel`, `Checks` and citation chips. Notice how the buttons change with the **actions the server would send**, while the component stays the same.

```tsx run src="support-pilot/frontend/src/citations.ts,support-pilot/frontend/src/format.ts,support-pilot/frontend/src/components/Checks.tsx,support-pilot/frontend/src/components/DraftPanel.tsx" flat title="The real DraftPanel in three situations" level=advanced autoclick="Blocked by a check"
import { useState } from "react";

const ok = (name: string) => ({ name, ok: true, severity: "block", detail: "" });
const GOOD = ["no_personal_data", "citations_exist", "cites_policy", "matches_policy", "no_overpromise", "no_internal_info", "mentions_order", "empathy", "length"].map(ok);
const decision = { action: "refund", code: "within_window", reason: "Delivered 7 days ago, inside the 10-day window.", amount: 4499, needs_lead: false, article: "returns" };
const base = { version: 1, source: "model", author: "copilot", created_at: "", citations: ["returns"], sources: ["returns", "refunds-timeline"], policy: decision, checks: GOOD,
  text: "Hi Asha,\n\nOrder AUR-1001 is inside our window, so we can refund ₹4,499 [kb:returns]. UPI refunds take 1 to 3 working days [kb:refunds-timeline] and cards 5 to 7 [kb:vip-promise].\n\nWarm regards,\nAurora Support" };

const SCENES: Record<string, any> = {
  "Agent, clean draft": { status: "drafted", actions: ["process", "edit", "reject", "approve"], draft: base },
  "Needs a team lead": { status: "needs_lead", actions: ["process", "edit", "reject"], draft: { ...base, policy: { ...decision, amount: 12999, needs_lead: true }, text: base.text.replace("4,499", "12,999") } },
  "Blocked by a check": { status: "drafted", actions: ["process", "edit", "reject"], draft: { ...base, checks: GOOD.map((c) => (c.name === "citations_exist" ? { ...c, ok: false, detail: "Unknown article: vip-promise." } : c)) } },
  "Approved": { status: "approved", actions: ["send"], draft: base },
};

export default function App() {
  const [which, setWhich] = useState("Agent, clean draft");
  const [said, setSaid] = useState("");
  const s = SCENES[which];
  return (
    <div className="stack">
      <style>{`.draft,.checks{margin-top:8px}.draft header h3{margin:0}.policy{font-size:14px}.text{white-space:pre-wrap;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 12px}.cite{display:inline-block;font-size:11.5px;font-weight:600;padding:0 7px;margin:0 2px;border-radius:6px;background:var(--accent);color:#fff}.cite.bad{background:var(--danger)}.checks ul{list-style:none;margin:6px 0;padding:0;font-size:14px}.checks li{display:grid;grid-template-columns:18px 1fr;gap:6px}.pass>span:first-child{color:var(--ok)}.fail>span:first-child{color:var(--danger)}.problem{color:var(--danger)}.ok{color:var(--ok)}.note{padding:8px 12px;border-radius:10px;background:var(--card)}.badge{font-size:12px;padding:1px 9px;border-radius:99px;background:var(--card);margin-left:6px}.row-buttons{display:flex;gap:8px;flex-wrap:wrap}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden}.small{font-size:13px}`}</style>
      <div className="row">{Object.keys(SCENES).map((k) => <button key={k} className={k === which ? "primary" : ""} onClick={() => { setWhich(k); setSaid(""); }}>{k}</button>)}</div>
      <DraftPanel key={which} draft={s.draft} status={s.status} actions={s.actions} busy={false}
        onEdit={async (t) => setSaid(`saved and re-checked: ${t.length} characters`)} onApprove={() => setSaid("approve sent to the server")} onReject={(r) => setSaid(`rejected: "${r}"`)} onSend={() => setSaid("send sent to the server")} />
      <p className="muted">server actions for this ticket: [{s.actions.join(", ")}] {said && `· ${said}`}</p>
    </div>
  );
}
```

Click through the four scenes. In *Blocked by a check* the Approve button is gone and a note says why; in *Needs a team lead* an agent sees the same, with a different reason. Both come from the same list the server sent. The red chip in every scene is the invented citation `vip-promise`: valid chips are purple, unknown ones red.

## The ticket view: loading, acting, streaming

```tsx src="support-pilot/frontend/src/components/TicketView.tsx" region="ticket" title="frontend/src/components/TicketView.tsx"
```

Three patterns, each worth knowing:

1. **Load, then act, then replace.** Every action (`act`) calls the API, which returns the **updated ticket**, and the view simply replaces its state. There is no hand-written "after approving, set status to approved": the server's answer is the truth, including the new list of allowed actions.
2. **Stream, then reload.** `process()` dispatches events into the reducer as they arrive. When the stream ends, it reloads the ticket from the server, so the saved draft, status and audit trail replace the live preview. A refresh in the middle loses nothing, because nothing important lived only in the browser.
3. **Abort is a choice, not an error.** An `AbortController` stops watching; the cleanup in `useEffect` aborts when you switch tickets, so one ticket's events never land on another's screen.

The offline **Simulate** selector (only visible with the offline model) is how the e2e test and your own exploration trigger a bad draft, a leak, or a flaky provider on demand.

## The inbox

```tsx src="support-pilot/frontend/src/components/Inbox.tsx" region="inbox" title="frontend/src/components/Inbox.tsx"
```

A coloured dot for priority (with a text `title`, because colour alone is not enough), a badge for status, the triage summary as a one-line preview, and filters as toggle buttons with `aria-pressed`. The API sorts tickets by priority first, newest second, so an urgent ticket is always at the top.

## The shell and the sign-in gate

```tsx src="support-pilot/frontend/src/components/Login.tsx" region="login" title="frontend/src/components/Login.tsx"
```

```tsx src="support-pilot/frontend/src/App.tsx" region="app" title="frontend/src/App.tsx"
```

On load, `App` checks whether a token from earlier in this tab is **still valid** (`whoAmI`); if not, it is thrown away and the sign-in screen appears. The Metrics tab renders only for a lead, but the server refuses the request to anyone else regardless (lesson 12). On a phone, the inbox and the ticket take turns on the screen, with a back button.

## Accessibility, briefly

| Choice | Benefit |
|---|---|
| buttons and `details`/`summary`, not clickable `div`s | keyboard and screen-reader support for free |
| `role="alert"` on errors, `role="status"` on confirmations | announced when they appear |
| status as text *and* colour; checks as symbol *and* word | meaning never depends on colour alone |
| `aria-pressed` on filter chips, `aria-current` on the open ticket | state is announced |
| `prefers-reduced-motion` respected for the blinking caret | comfort |
| a light and a dark theme from `prefers-color-scheme` | comfort, and long shifts |

## Tests

```ts src="support-pilot/frontend/src/pipelineReducer.test.ts" title="frontend/src/pipelineReducer.test.ts"
```

```ts src="support-pilot/frontend/src/citations.test.ts" title="frontend/src/citations.test.ts"
```

The browser-level test (Playwright, in the repository's `tools` folder) drives the whole flow: sign in as an agent, draft, approve and send; discover that a large refund needs a lead; sign in as the lead and approve it; see an escalation; watch a bad draft block approval and get fixed by an edit; see a flaky provider retried in the trace; open the metrics; submit the public form; and check the phone layout. It runs in 36 checks.

:::keypoints
- The interface must answer four questions at a glance: what the customer wants, what was decided and why, whether the draft is safe, and what to do next.
- Logic lives in small pure modules (a reducer, a citation splitter, a layout function); components stay thin.
- The server returns the list of allowed actions; the browser draws exactly those buttons and holds no rules.
- After every action, replace local state with the server's response: it is the single source of truth.
- Stream into a reducer, then reload from the server when the stream ends; abort is a choice, not an error.
- Explain missing buttons in words. Never rely on colour alone. Use native elements.
- Treat a stale or wrong token by returning to sign-in, not by showing a broken screen.
:::

```quiz
? Why does the draft panel not contain any rules about roles?
- Roles are not important
+ The server sends the list of allowed actions; the panel draws those buttons, so the rules live in one place
- React cannot check roles
> One source of truth: workflow.py.
? What does the `reset` event do in the browser?
- Reloads the page
+ Clears the first draft so a rewritten draft is not appended to it
- Signs the user out
> The reducer empties the streamed text before the revision arrives.
? After pressing Approve, how does the screen get its new state?
- It sets the status to "approved" itself
+ It replaces the ticket with the server's response, which includes the new status and actions
- It reloads the whole page
> Never re-implement the server's logic in the browser.
```

:::exercise A keyboard shortcut and an undo
Add keyboard shortcuts to the draft panel: `e` to edit, `Ctrl+Enter` to save and re-check. Then add "Undo send" that only works for ten seconds after sending: think first about what the *server* must support for this to be real (a `sent` state that is not final yet, and a delay before anything leaves the building), and whether the interface alone could ever honestly offer it.
:::
