---
title: The task store
level: easy
time: 30
summary: Start with the part that has no AI in it. The to-do list is one SQLite table and five small functions, and it runs (and is tested) completely on its own. An agent is only as trustworthy as the plain code it acts on.
tags: SQLite, store, ordering, testing, separation of concerns
---

Before any model is involved, build the thing the model will act on. This is the most important habit in agent work: **put the real logic in ordinary code that you can test without a model**, and let the agent be a thin layer that *calls* it.

TaskPal's tools (lesson 3) and its checkboxes in the browser both go through the same `TaskStore`. There is one place where "add a task" is defined, so the agent and the person can never disagree about what it means.

## One table

```python src="task-pal/backend/app/store.py" region="schema" title="backend/app/store.py"
```

Three small decisions here will matter later:

- **`due` is text in `YYYY-MM-DD` form, or `NULL`.** SQLite has no date type, but this format sorts correctly as plain text, so "due before the 25th" is a simple comparison. `NULL` means "no date", and that has to be treated carefully (see ordering, below).
- **`CHECK` constraints on `priority` and `done`.** The database refuses a priority of `"urgent"` even if some bug in our code tried to write it. Rules enforced at the lowest level cannot be forgotten at a higher one.
- **`done` is 0 or 1**, because SQLite has no boolean either. The code converts at the edge (`bool(row["done"])`), so the rest of the program only sees `True` and `False`.

## Five functions

```python src="task-pal/backend/app/store.py" region="store" title="backend/app/store.py"
```

Points worth a second look:

1. **A lock.** FastAPI handles the checkbox requests on one thread and the agent runs on another. SQLite is fine with that if we tell it (`check_same_thread=False`) and make sure two operations do not interleave (`threading.Lock`). Without the lock the code works in testing and fails once in a thousand times in real use, which is the worst kind of bug.
2. **`?` placeholders, never string-building.** Values reach SQL as parameters, never pasted into the text. The model's task title is *untrusted input*, and `'); DROP TABLE tasks; --` must be just an odd title. (The one `f"UPDATE ... SET {', '.join(...)}"` builds only column names, taken from a fixed allow-list, never from the caller.)
3. **`update` changes only the fields it is given.** Renaming a task must not erase its date. A value of `None` for `due` is allowed and means "remove the date", so the store cannot tell "not given" from "given as nothing" by looking at the value; it looks at which *keys* were passed. Lesson 3 returns to this.
4. **The ordering.** Open tasks first; then by due date with undated tasks *last* (`due IS NULL` sorts false before true); then high priority before normal before low. A list that is in a sensible order is a list a person (and a model) can scan.

## Try it

This block runs the real `store.py` in your browser (Python's `sqlite3` is part of the runtime). Read the output against the ordering rule above.

```python run src="task-pal/backend/app/store.py" title="Use the store" level=easy
store = TaskStore()                                   # an in-memory database

store.add("Book train tickets")                       # no date
store.add("Call mum", "2026-10-23")
store.add("Pay the electricity bill", "2026-10-20", "high")
store.add("Buy milk", "2026-10-20")
store.add("Renew passport", "2026-12-01", "low")

def show(rows):
    for t in rows:
        box = "x" if t["done"] else " "
        print(f"  #{t['id']} [{box}] {t['title']:<26} {t['due'] or '-':<11} {t['priority']}")

print("open tasks, in order:")
show(store.list())

store.update(4, done=True)                            # tick "Buy milk"
store.update(1, due="2026-10-19", priority="high")    # give the undated task a date
store.update(2, due=None)                             # a value of None REMOVES the date
print("\nafter three updates (the open list):")
show(store.list())

print("\ndue on or before 20 Oct:", [t["title"] for t in store.list(due_before="2026-10-20")])
print("done:", [t["title"] for t in store.list("done")])
print("high priority:", [t["title"] for t in store.list(priority="high")])

print("\nunknown id ->", store.update(99, done=True), "| delete twice ->", store.delete(5), store.delete(5))
```

```output
open tasks, in order:
  #3 [ ] Pay the electricity bill   2026-10-20  high
  #4 [ ] Buy milk                   2026-10-20  normal
  #2 [ ] Call mum                   2026-10-23  normal
  #5 [ ] Renew passport             2026-12-01  low
  #1 [ ] Book train tickets         -           normal

after three updates (the open list):
  #1 [ ] Book train tickets         2026-10-19  high
  #3 [ ] Pay the electricity bill   2026-10-20  high
  #5 [ ] Renew passport             2026-12-01  low
  #2 [ ] Call mum                   -           normal

due on or before 20 Oct: ['Book train tickets', 'Pay the electricity bill']
done: ['Buy milk']
high priority: ['Book train tickets', 'Pay the electricity bill']

unknown id -> None | delete twice -> True False
```

Change a title to `"'); DROP TABLE tasks; --"` and run again: it is stored as an odd title and the table survives. That is what placeholders buy you.

## The tests

```python src="task-pal/backend/tests/test_store.py" region="ordering-test" title="backend/tests/test_store.py"
```

The rest of `test_store.py` checks filters, partial updates, clearing a date, an unknown id, that unknown column names are ignored rather than put into SQL, that the database enforces its own `CHECK` rules, and that a file database survives a restart. None of it needs a model, a network or a key, and it runs in a fraction of a second. You will have 45 backend tests by the end of the project, and almost all of them are like these.

:::keypoints
- Put the real logic in plain code (`TaskStore`) and test it alone. The agent is a thin layer on top.
- The agent and the person share one store, so there is one definition of every operation.
- Treat everything the model sends as untrusted input: use `?` placeholders, and let the database enforce its own rules with `CHECK`.
- A lock makes a store safe for the threads a web server uses.
- "Not given" and "given as nothing" are different. `update` looks at which keys were passed, not at their values.
:::

```quiz
? Why is `store.py` free of any AI code?
- Because SQLite cannot be used with AI
+ So it can be tested alone, and so the agent and the browser can share the same logic
- To make the app faster
> Plain code is testable and trustworthy. The model gets to call it; it does not get to change what it means.
? A task title is `'); DROP TABLE tasks; --`. What does the store do?
- Deletes the table
+ Stores it as an unusual title, because values travel as parameters, never as SQL text
- Refuses it
> Placeholders keep data and SQL apart. The same applies to everything a model sends.
? Which task comes first in the open list?
- The newest task
+ The one with the earliest due date; undated tasks come last, high priority breaking ties
- The one with the longest title
> A well-ordered list is easy for a person and for a model to read.
```

:::exercise Search by word
Add `search(self, text)` to `TaskStore`: tasks whose title contains the text, ignoring case, using `LIKE ?`. Careful: the user's text may contain `%` or `_`, which `LIKE` treats specially. Write a test with a task called `"100% done"` and search for `"%"`. How would you make that test pass?
:::
