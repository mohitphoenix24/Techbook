---
title: The approval screen
level: easy
time: 45
summary: The only place a note can change. The two routes behind the Apply and Reject buttons, how a stale proposal becomes a 409 with a reason on the card, and the React pieces that make a decision easy: a coloured diff, counts, and buttons that cannot be pressed twice. The real components run in your browser.
tags: human in the loop, React, diff view, FastAPI, HTTP 409, accessibility
---

Everything so far has been about making the agent *unable* to do harm. This lesson is the other half: making it *easy for a person to say yes or no* correctly. A review screen that is slow, confusing or ambiguous gets rubber-stamped, and then the safety is only on paper.

## The routes

```python src="note-keeper/backend/app/main.py" region="proposal-routes" title="backend/app/main.py"
```

The docstring on `apply_proposal` states the project's central fact: *only a person's click gets here: the agent's tools have no route to it.* Check it for yourself: the agent loop receives a `ToolBox`, and `ToolBox` holds `notes` and `proposals`, but the tools only ever call `proposals.add`. `proposals.apply` is called from one place in the whole code base: this route.

The status codes tell the browser what went wrong:

| Situation | Status | The card shows |
|---|---|---|
| applied | `200` and the proposal, now `applied` | the card leaves the pending list |
| no such proposal | `404` | the reason |
| already decided (a second click, or another tab) | `409 Conflict` | "Proposal #1 was already applied." |
| the note changed since the proposal was made | `409` | "The note 'ideas' changed after this was proposed, so applying it could overwrite newer work. Ask for a fresh proposal." |

`409 Conflict` is the right code for "your request is understood but the current state of things forbids it", and the body carries a human-readable `detail` that the browser shows verbatim. Here is the real app running that flow: a proposal is applied, applied again, and another is made stale by a direct edit.

```python local verify cwd="note-keeper/backend" title="Apply, repeat, go stale"
import tempfile

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

settings = Settings(anthropic_api_key=None, notes_dir=tempfile.mkdtemp(), frontend_dist="nope", _env_file=None)
with TestClient(create_app(settings)) as client:
    notes, props = client.app.state.notes, client.app.state.proposals
    a = props.add(notes, "append", "recipes", "## Chai\nTea, milk, ginger.", "A new recipe")      # what propose_change does
    b = props.add(notes, "replace", "recipes", "# Recipes\nonly one\n", "Shorten it")
    print("pending:", [(p["id"], p["action"], p["status"]) for p in client.get("/api/proposals").json()])
    print("recipes mentions Chai before:", "Chai" in client.get("/api/notes/recipes").json()["content"])

    r = client.post(f"/api/proposals/{a.id}/apply")
    print("apply #1 ->", r.status_code, r.json()["status"], "| Chai now there:", "Chai" in client.get("/api/notes/recipes").json()["content"])
    r = client.post(f"/api/proposals/{a.id}/apply")
    print("apply #1 again ->", r.status_code, r.json()["detail"])
    r = client.post(f"/api/proposals/{b.id}/apply")
    print("apply #2 (the note changed under it) ->", r.status_code, r.json()["detail"])
    print("reject #2 ->", client.post(f"/api/proposals/{b.id}/reject").json()["status"])
    print("unknown ->", client.post("/api/proposals/99/apply").status_code)
```

```output
pending: [(1, 'append', 'pending'), (2, 'replace', 'pending')]
recipes mentions Chai before: False
apply #1 -> 200 applied | Chai now there: True
apply #1 again -> 409 Proposal #1 was already applied.
apply #2 (the note changed under it) -> 409 The note 'recipes' changed after this was proposed, so applying it could overwrite newer work. Ask for a fresh proposal.
reject #2 -> rejected
unknown -> 404
```

## The diff, line by line

The server sends the diff as **text**. The browser must colour it, and it must do so without ever building HTML from the note's content. The parsing is a small pure function with its own tests:

```ts src="note-keeper/frontend/src/format.ts" region="diff" title="frontend/src/format.ts"
```

Every line is classified by its **first character**: `+` arrives, `-` goes, a space stays, `@@` starts a block. The first two lines (`--- file`, `+++ file`) are the header. One edge case has a test of its own, and it is a good one: what if a *note* line itself starts with dashes? A deleted note line `-- a rule` appears in the diff as `--- a rule`. A naive parser would take it for a header. The code only treats lines 0 and 1 as headers, and the test `is not fooled by a note line that itself starts with dashes` pins it.

```tsx src="note-keeper/frontend/src/components/DiffView.tsx" title="frontend/src/components/DiffView.tsx"
```

Each line renders as `<span className="txt">{l.text}</span>`: **a text node, never HTML**. A note containing `<img src=x onerror=alert(1)>` shows up as those exact characters. The `+` and `−` signs sit in a separate `aria-hidden` column, so they are visible but do not get read out twice, and the colour (green and red backgrounds) is never the only signal: the signs are there too.

## The card

```tsx src="note-keeper/frontend/src/components/ProposalCard.tsx" region="card" title="frontend/src/components/ProposalCard.tsx"
```

Look at what the card does to make a good decision easy:

- **The action as a coloured badge** (Create, Replace, Add to, **Delete** in red) and the note's name. You see the danger before you read a line.
- **The reason**, in the model's words, in its own line.
- **`+3 −1`**: how big the change is, at a glance.
- **The diff is open by default** for anything but a large new note (a long `create` collapses so it does not push the buttons off-screen).
- **`busy`** disables both buttons while a request is in flight, so a double click cannot send two requests.
- **A `problem` line** shows the server's own explanation when it refuses (the stale message above). The component does not translate it; the server wrote it for a person.

## See it

This block runs the real `ProposalCard` and `DiffView`. Press **Apply** on the first proposal and it succeeds; on the second, the "server" says the note changed, and you see the message appear on the card. (The two handlers are functions in this demo that behave as the two cases above; the cards and diffs are the real components.)

```tsx run src="note-keeper/frontend/src/format.ts,note-keeper/frontend/src/components/DiffView.tsx,note-keeper/frontend/src/components/ProposalCard.tsx" flat title="The real approval cards" level=easy autoclick="Apply"
import { useState } from "react";

const css = `
:root{--panel:var(--card);--muted:var(--text-dim,#64748b);--ok:#15803d;--bad:#c62d3f;--bad-bg:rgba(220,38,38,.12);--add-bg:rgba(22,163,74,.16);--add-fg:#15803d;--del-bg:rgba(220,38,38,.14);--del-fg:#c62d3f;--hunk:#64748b;--panel-2:rgba(127,127,127,.14)}
.proposal{background:var(--bg);border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:10px;padding:10px 12px;margin-bottom:10px}
.proposal.delete{border-left-color:var(--bad)}.proposal header{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.proposal .stat{margin-left:auto;display:flex;gap:6px}
.plus{color:var(--ok);font-weight:600}.minus{color:var(--bad);font-weight:600}.muted{color:var(--muted)}.small{font-size:12.5px}
.badge{font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:700;padding:1px 7px;border-radius:6px;background:var(--panel-2);color:var(--accent)}.badge.delete{background:var(--bad-bg);color:var(--bad)}
.reason{margin:6px 0;font-size:14px}.proposal details summary{cursor:pointer;font-size:13px;color:var(--muted)}
.diff{margin:6px 0 0;border:1px solid var(--border);border-radius:8px;overflow-x:auto;font:12.5px/1.5 ui-monospace,monospace;background:none}
.dl{display:grid;grid-template-columns:18px 1fr;white-space:pre-wrap;overflow-wrap:anywhere;padding-right:8px}.dl .sign{text-align:center;user-select:none}
.dl.add{background:var(--add-bg);color:var(--add-fg)}.dl.del{background:var(--del-bg);color:var(--del-fg)}.dl.hunk,.dl.meta{color:var(--hunk);background:var(--panel-2)}
.actions{display:flex;gap:8px;margin-top:10px}.problem{margin:8px 0 0;color:var(--bad);font-size:13.5px}
`;

const P = [
  { id: 1, action: "append" as const, name: "meeting-2026-10-12", reason: "The pasted email mentions a water cut.", status: "pending" as const,
    diff: "--- meeting-2026-10-12.md\n+++ meeting-2026-10-12.md\n@@ -15,2 +15,3 @@\n ## Open question\n Do we offer the early-access group a discount code? Decide on Thursday.\n+- Landlord: water supply off Saturday 25 Oct, 10 am to 1 pm.\n" },
  { id: 2, action: "replace" as const, name: "reading-list", reason: "Dropped the articles and podcasts.", status: "pending" as const,
    diff: "--- reading-list.md\n+++ reading-list.md\n@@ -1,10 +1,6 @@\n # Reading list\n \n ## Books\n-- The Pragmatic Programmer (started)\n+- The Pragmatic Programmer (finished)\n-\n-## Articles to read\n-- How databases store data on disk\n" },
  { id: 3, action: "delete" as const, name: "recipes", reason: "You asked me to remove notes that are not about work.", status: "pending" as const,
    diff: "--- recipes.md\n+++ (deleted)\n@@ -1,4 +0,0 @@\n-# Recipes to try\n-\n-## Masala omelette\n-<img src=x onerror=alert(1)> Eggs, onion, green chilli.\n" },
];

export default function App() {
  const [done, setDone] = useState<Record<number, string>>({});
  // The first proposal succeeds. The second says the note changed. The third can be rejected.
  const apply = async (id: number) => {
    await new Promise((r) => setTimeout(r, 250));
    if (id === 2) throw new Error("The note 'reading-list' changed after this was proposed, so applying it could overwrite newer work. Ask for a fresh proposal.");
    setDone((d) => ({ ...d, [id]: "applied" }));
  };
  const reject = async (id: number) => { await new Promise((r) => setTimeout(r, 250)); setDone((d) => ({ ...d, [id]: "rejected" })); };
  const pending = P.filter((p) => !done[p.id]);
  return (
    <div className="stack">
      <style>{css}</style>
      {pending.length === 0 && <p className="muted">Nothing is waiting. Reload the preview to start again.</p>}
      {pending.map((p) => <ProposalCard key={p.id} p={p} onApply={apply} onReject={reject} />)}
      {Object.keys(done).length > 0 && <p className="muted small">Decided: {Object.entries(done).map(([id, s]) => `#${id} ${s}`).join(" · ")}</p>}
    </div>
  );
}
```

The third proposal contains `<img src=x onerror=alert(1)>` as a line of the note it would delete. Look at the diff: it is displayed as plain characters, and nothing runs. That is the whole point of rendering text as text.

![A stale proposal: Apply was pressed after the note was edited, and the card shows the server's reason](assets/img/note-keeper-stale.png)

## The sidebar and the viewer

`Sidebar` shows the pending cards at the top, a collapsed list of decided ones, and the notes below (click a note to open it). `NoteViewer` uses a native `<dialog>`: `showModal()` gives you a backdrop, trapped keyboard focus, `Escape` to close and the right accessibility semantics for free, and the note text goes into a `<pre>`. After every decision `App` reloads the notes and proposals together (`reload()`), so the sidebar always shows the truth, including the new size of a note you just applied a change to.

:::keypoints
- Safety needs a review screen that is easy to use correctly: a clear action badge, the reason, change counts and a coloured diff.
- `409 Conflict` with a human-readable detail is the right answer for "already decided" and "stale"; show the server's words on the card.
- Render diffs and notes as **text nodes**, never HTML. A note can say anything and must not run.
- Classify diff lines by their first character, and only treat the first two lines as the header.
- Disable both buttons while a request is in flight, and never rely on colour alone.
:::

```quiz
? What status code means "the note changed since this was proposed"?
- 404 Not Found
+ 409 Conflict
- 500 Internal Server Error
> The request is understood but the current state forbids it. The body explains why.
? A note line starts with `--`. Why does the diff parser not mistake it for a header?
- It does not matter
+ Only lines 0 and 1 of a diff are treated as the header; later lines are classified by their first character
- Notes cannot start with dashes
> This edge case has its own test.
? Why does DiffView render each line as a text node?
+ A note can contain markup, and it must be shown, never executed
- Text nodes are faster
- HTML is not supported
> Rendering model or user content as HTML is how scripts get in.
```

:::exercise Edit before applying
Add an **Edit** button on a `replace` or `create` proposal that lets the person change the proposed text before applying. Where would you store the edited text, and what must the server do to make sure the diff the person saw is still the change that is applied? (Think: which function must the new route call, so that the preview and the effect cannot drift apart?)
:::
