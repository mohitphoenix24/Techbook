---
title: Proposals and diffs
level: easy
time: 45
summary: The mechanism that makes the agent safe. A proposal is data, not an action: what would change, a diff showing it, and a fingerprint of the note it was written against. Apply is the only code that writes, and it refuses a proposal that has gone stale. All of it runs in your browser.
tags: human in the loop, proposals, diff, difflib, optimistic concurrency, fingerprints
---

The agent may not change a note. But it *should* be able to suggest changes, or it is only half useful. The bridge is a **proposal**: a record of a change, kept in memory, with everything a person needs to judge it.

## What a proposal holds

```python src="note-keeper/backend/app/proposals.py" region="after" title="backend/app/proposals.py"
```

Two pure functions do the thinking:

- **`result_of(action, before, content)`** says what the note would contain *after* the change (or `None` if it would be deleted). `create` and `replace` give the new content, `append` adds to the end (taking care of the newline), `delete` gives nothing.
- **`diff_of(name, before, after)`** turns that into a **unified diff**, the format that every code review shows: lines starting with `-` go, lines starting with `+` arrive, lines starting with a space stay, `@@` starts a block of changes. Python's `difflib` makes it.

Here they are in action:

```python run src="note-keeper/backend/app/proposals.py#after" title="What a change looks like" level=easy
import difflib                          # the regions we run use it (the file's own imports are left out)

before = "# Ideas\n- build a to-do agent\n- try web search\n"

print("REPLACE one line:")
print(diff_of("ideas", before, before.replace("web search", "the notes agent")))

print("APPEND:")
print(diff_of("ideas", before, result_of("append", before, "- learn about MCP")))

print("DELETE:")
print(diff_of("ideas", before, result_of("delete", before, None)))

print("CREATE:")
print(diff_of("weekend", None, result_of("create", None, "# Weekend\n- cycle\n")))
```

```output
REPLACE one line:
--- ideas.md
+++ ideas.md
@@ -1,3 +1,3 @@
 # Ideas
 - build a to-do agent
-- try web search
+- try the notes agent

APPEND:
--- ideas.md
+++ ideas.md
@@ -2,2 +2,3 @@
 - build a to-do agent
 - try web search
+- learn about MCP

DELETE:
--- ideas.md
+++ (deleted)
@@ -1,3 +0,0 @@
-# Ideas
-- build a to-do agent
-- try web search

CREATE:
--- (new note)
+++ weekend.md
@@ -0,0 +1,2 @@
+# Weekend
+- cycle
```

Read the delete diff: every line is red, and the header says `+++ (deleted)`. A person looking at that cannot mistake what Apply will do.

:::tip The diff is the contract
There is one subtle but important design rule here: the diff shown to the person is computed from `result_of`, **the same function `apply` uses to decide what to write**. If the preview and the action came from two different code paths, they could drift apart, and a person would approve one thing while another happened. Make the preview and the effect share their logic.
:::

## The store

```python src="note-keeper/backend/app/proposals.py" region="store" title="backend/app/proposals.py"
```

Three methods carry all the weight.

**`add`** checks the request against the folder *as it is now* and records it. It refuses a `create` for a name that exists, a `replace`, `append` or `delete` for a note that does not, a missing `content`, and a note that would exceed the size limit. Crucially it **writes nothing**: it computes `before`, `after` and the diff, and remembers a **fingerprint** of `before`.

**`apply`** is the **only** code in the project that changes a note. It is called from one route, and only a click reaches that route. It refuses a proposal that is not `pending` (so pressing Apply twice cannot append twice), and it refuses a stale one:

**The fingerprint.** `fingerprint(before)` is a short hash of the note's text when the proposal was made (or `None` if the note did not exist). When Apply runs, it hashes the note *now*. If the two differ, you edited the note after the proposal was written, and applying it would overwrite your newer work with a change that was based on old text. So `apply` refuses, with a clear message, and the proposal stays visible so you can ask for a fresh one.

:::note Optimistic concurrency
This is a small instance of a big idea. You do not lock the note while a proposal waits (a person might take an hour to decide). You *assume* nothing changed, and **check at the last moment**, using a version stamp (here a hash). Databases call it optimistic concurrency, and the same trick prevents lost updates in shared documents, wikis and shopping carts.
:::

## Try the lifecycle

```python run src="note-keeper/backend/app/notes.py,note-keeper/backend/app/proposals.py" flat title="Propose, decide, go stale" level=easy
import tempfile

notes = Notes(tempfile.mkdtemp())
notes.write("ideas", "# Ideas\n- build a to-do agent\n")
notes.write("shopping", "# Shopping\nmilk\neggs\n")
props = Proposals()

def show(label):
    print(f"{label:<44}", [(p.id, p.action, p.name, p.status) for p in props.all()])

a = props.add(notes, "append", "ideas", "- try web search", "new idea from today")
d = props.add(notes, "delete", "shopping", None, "not needed")
r = props.add(notes, "replace", "ideas", "# Ideas\nrewritten\n", "tidy up")
show("three proposals, nothing applied yet:")
print("  ideas still says:", repr(notes.read("ideas")), "\n  shopping exists:", notes.exists("shopping"))

props.apply(a.id, notes)
show("applied #1 (append):")
print("  ideas now says:", repr(notes.read("ideas")))

props.reject(d.id)
show("rejected #2 (delete):")
print("  shopping exists:", notes.exists("shopping"))

for label, call in [("apply #1 again", lambda: props.apply(a.id, notes)), ("apply #3 (it was written before #1 changed ideas)", lambda: props.apply(r.id, notes))]:
    try:
        call()
    except NoteError as exc:
        print(f"{label}:\n   refused: {exc}")
print("ideas is still:", repr(notes.read("ideas")))
```

```output
three proposals, nothing applied yet:        [(1, 'append', 'ideas', 'pending'), (2, 'delete', 'shopping', 'pending'), (3, 'replace', 'ideas', 'pending')]
  ideas still says: '# Ideas\n- build a to-do agent\n' 
  shopping exists: True
applied #1 (append):                         [(1, 'append', 'ideas', 'applied'), (2, 'delete', 'shopping', 'pending'), (3, 'replace', 'ideas', 'pending')]
  ideas now says: '# Ideas\n- build a to-do agent\n- try web search\n'
rejected #2 (delete):                        [(1, 'append', 'ideas', 'applied'), (2, 'delete', 'shopping', 'rejected'), (3, 'replace', 'ideas', 'pending')]
  shopping exists: True
apply #1 again:
   refused: Proposal #1 was already applied.
apply #3 (it was written before #1 changed ideas):
   refused: The note 'ideas' changed after this was proposed, so applying it could overwrite newer work. Ask for a fresh proposal.
ideas is still: '# Ideas\n- build a to-do agent\n- try web search\n'
```

The last refusal is the important one. Proposal 3 was written when `ideas` had one line; proposal 1 then added another; applying 3 would have silently thrown away that second line. It was refused because the note's fingerprint no longer matched.

## Proposals live in memory

`Proposals` keeps its list in a plain dictionary. If the server restarts, pending proposals are gone, and that is an acceptable trade for a learning project: a proposal is cheap to ask for again, and the notes themselves are on disk. (A real product would persist proposals, so a person could come back tomorrow. The exercise at the end of the project asks you to.)

## The tests

```python src="note-keeper/backend/tests/test_proposals.py" region="lifecycle-tests" title="backend/tests/test_proposals.py"
```

```python src="note-keeper/backend/tests/test_proposals.py" region="stale-test" title="backend/tests/test_proposals.py"
```

`test_adding_a_proposal_changes_nothing` is the test the whole project rests on: it adds a replace, a delete and a create, then compares every note on disk to a snapshot taken before. `test_a_proposal_can_only_be_decided_once` proves that applying twice appends once. The stale tests cover both a `replace` and a `create` whose name was taken in the meantime.

:::keypoints
- A proposal is data: the action, a diff, and a fingerprint of the note it was based on. Making one changes nothing.
- Compute the preview and the effect from the same function, so what the person approves is what happens.
- `apply` is the only code that writes, and only a click can reach it. It refuses a repeat and a stale proposal.
- A fingerprint check at the last moment (optimistic concurrency) protects the person's newer work without locking anything.
- Test the invariant the design depends on: a proposal changes nothing on disk.
:::

```quiz
? What does a proposal's fingerprint protect against?
- A typing mistake in the note name
+ Applying a change that was based on text the person has since edited
- A slow network
> If the note changed after the proposal was made, applying it could overwrite newer work.
? Why compute the diff from the same function `apply` uses to decide what to write?
- It is faster
+ So the preview and the effect cannot drift apart: what is approved is what happens
- Diffs need Python
> A preview from a different code path can lie.
? What happens when you press Apply twice on the same proposal?
- The change is made twice
+ The second press is refused: a proposal can only be decided once
- The note is deleted
> The status changes to applied, and `apply` refuses anything not pending.
```

:::exercise Persist the proposals
Store proposals in a SQLite table instead of a dictionary, so they survive a restart. Decide what to do with proposals whose note has changed while the server was off (hint: the fingerprint already tells you). Which tests from `test_proposals.py` should pass unchanged, and what does that tell you about where the storage decision lives?
:::
