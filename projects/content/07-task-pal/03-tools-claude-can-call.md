---
title: Tools Claude can call
level: easy
time: 40
summary: What a tool really is (a name, a description and a schema that Claude reads, plus a function that you run), how Pydantic models give you the schema and the input check from one definition, and why every failure becomes a message the model can read instead of an exception.
tags: tools, JSON Schema, Pydantic, validation, tool descriptions, errors
---

A **tool** is two things that live in different places:

1. A **definition** that Claude reads: a name, a description in plain language, and a JSON Schema for the inputs. This is the *menu*.
2. A **function** that your code runs when Claude asks for the tool. This is the *kitchen*.

Claude never sees the function. It sees the menu, decides what to order, and writes the order. Your code cooks it.

## The definition Claude reads

Here is the shape the API expects for each tool:

```json title="One tool, as sent to the API"
{
  "name": "add_task",
  "description": "Add one new task to the list. Call it once per task.",
  "input_schema": {
    "type": "object",
    "properties": {
      "title":    {"type": "string", "description": "A short title, such as 'Pay the electricity bill'."},
      "due":      {"anyOf": [{"type": "string", "format": "date"}, {"type": "null"}], "description": "Due date as YYYY-MM-DD. Leave it out when the user gave no date."},
      "priority": {"enum": ["low", "normal", "high"], "description": "Use 'high' only if the user says it is urgent or important."}
    },
    "required": ["title"]
  }
}
```

Nothing in it is code. It is a *description of a function call*, and the descriptions are the prompt that teaches Claude when and how to use it. Read the three field descriptions again: each one prevents a specific mistake. "Leave it out when the user gave no date" stops the model inventing a date. "Use 'high' only if the user says it is urgent" stops every task becoming high priority.

:::tip Write tool descriptions like instructions to a new colleague
Say *when* to use the tool, *what each input means* (with an example), and *what not to do*. "Never guess an id: list the tasks first" in `update_task` is the single most useful sentence in this project, because the model would otherwise happily invent `id: 7`.
:::

## One definition, two jobs

Writing that JSON by hand and *also* writing code to check the input would mean two things to keep in step. Instead, each tool has a **Pydantic model**, and the model produces the schema *and* does the checking:

```python src="task-pal/backend/app/tools.py" region="inputs" title="backend/app/tools.py"
```

```python src="task-pal/backend/app/tools.py" region="definitions" title="backend/app/tools.py"
```

`schema_of` turns each model into the schema Claude reads (and removes the `title` keys Pydantic adds on its own, which are noise). Because `Field(description=...)` and `ge=`/`max_length=` live on the model, the **same words** that guide Claude also bound what we accept. Add a field to the model and both the menu and the check update together.

## The toolbox

```python src="task-pal/backend/app/tools.py" region="toolbox" title="backend/app/tools.py"
```

Read `call` slowly. It is the most defensive function in the project, because **everything the model sends is untrusted input**:

- An unknown tool name returns an error message, not a `KeyError`.
- Input that fails validation (`due: "next friday"`, `priority: "urgent"`, a missing `id`) returns *which* field was wrong and says "fix the input and try again".
- A missing task returns "there is no task with id 42. Call list_tasks to see the ids."
- **Nothing raises.** `call` always returns a `ToolResult`.

That last point is the heart of how agents recover. When a tool fails, the loop does not crash; it sends the error text back to Claude, flagged `is_error: true`, and Claude *reads it and tries again differently*. The messages are written for that reader. "Error: there is no task with id 42" is a dead end; "...Call list_tasks to see the ids" is a way forward.

`ToolResult` carries four things, for two audiences: `content` is what **the model** sees; `summary` is the short label **the person** sees in the step list; `ok` tells the loop whether to set `is_error`; `changed` tells the browser to reload the board.

:::note The null trap in update_task
`due: null` means "remove the date", while *leaving `due` out* means "leave the date alone". After validation the value is `None` in both cases, so the code looks at `a.model_fields_set` (the fields that were actually in the input) to tell them apart. Without it, renaming a task would silently erase its due date. It is a small detail that shows why tool inputs deserve tests.
:::

## Try it

This block runs the real `store.py` and `tools.py` in your browser. It prints the schema Claude would read for `update_task`, then calls the toolbox the way the loop does: first with good inputs, then with the kind of bad ones a model produces.

```python run src="task-pal/backend/app/store.py,task-pal/backend/app/tools.py" flat title="The real toolbox" level=easy
from datetime import date

box = ToolBox(TaskStore(), today=lambda: date(2026, 10, 18))     # we pass in "today", so it is the same every run

update = next(t for t in TOOLS if t["name"] == "update_task")
kinds = lambda v: v.get("type") or " or ".join(a["type"] for a in v["anyOf"])
print("update_task takes:", {k: kinds(v) for k, v in update["input_schema"]["properties"].items()})
print("required:", update["input_schema"]["required"], "\n")

def call(name, args):
    r = box.call(name, args)
    print(f"{name}({args})\n   -> {'ok   ' if r.ok else 'ERROR'} " + r.content.replace("\n", "\n         "))

call("get_today", {})
call("add_task", {"title": "Call the plumber", "due": "2026-10-21", "priority": "high"})
call("add_task", {"title": "Buy milk"})
call("list_tasks", {})
call("update_task", {"id": 2, "done": True})
call("update_task", {"id": 1, "due": None})
print()
call("add_task", {"title": "Call mum", "due": "next friday"})        # a date the model did not convert
call("add_task", {"title": "x", "priority": "urgent"})               # not one of the allowed values
call("update_task", {"title": "no id"})                               # a required field is missing
call("update_task", {"id": 42, "done": True})                         # an id that does not exist
call("update_task", {"id": 1})                                        # nothing to change
call("make_coffee", {})                                               # a tool that does not exist
```

```output
update_task takes: {'id': 'integer', 'title': 'string or null', 'due': 'string or null', 'priority': 'string or null', 'done': 'boolean or null'}
required: ['id'] 

get_today({})
   -> ok    Today is 2026-10-18, a Sunday.
add_task({'title': 'Call the plumber', 'due': '2026-10-21', 'priority': 'high'})
   -> ok    Added: #1 [ ] Call the plumber (due 2026-10-21, high priority)
add_task({'title': 'Buy milk'})
   -> ok    Added: #2 [ ] Buy milk (due no date, normal priority)
list_tasks({})
   -> ok    #1 [ ] Call the plumber (due 2026-10-21, high priority)
         #2 [ ] Buy milk (due no date, normal priority)
update_task({'id': 2, 'done': True})
   -> ok    Updated: #2 [x] Buy milk (due no date, normal priority)
update_task({'id': 1, 'due': None})
   -> ok    Updated: #1 [ ] Call the plumber (due no date, high priority)

add_task({'title': 'Call mum', 'due': 'next friday'})
   -> ERROR Error: invalid input. due: Input should be a valid date or datetime, invalid character in year. Fix the input and try again.
add_task({'title': 'x', 'priority': 'urgent'})
   -> ERROR Error: invalid input. priority: Input should be 'low', 'normal' or 'high'. Fix the input and try again.
update_task({'title': 'no id'})
   -> ERROR Error: invalid input. id: Field required. Fix the input and try again.
update_task({'id': 42, 'done': True})
   -> ERROR Error: there is no task with id 42. Call list_tasks to see the ids.
update_task({'id': 1})
   -> ERROR Error: nothing to change. Send at least one of title, due, priority, done.
make_coffee({})
   -> ERROR Error: there is no tool called 'make_coffee'. Available tools: get_today, list_tasks, add_task, update_task, delete_task.
```

Every `ERROR` line is something Claude will read and react to. Try changing one of the descriptions in the file and think about how that changes what the model will send.

## The tests

```python src="task-pal/backend/tests/test_tools.py" region="definition-tests" title="backend/tests/test_tools.py"
```

```python src="task-pal/backend/tests/test_tools.py" region="error-tests" title="backend/tests/test_tools.py"
```

The first group guards the *menu*: every tool is shaped as the API expects, every tool has a handler and every handler a tool (add one without the other and a test fails), and every field has a description. The second group is a table of bad calls, each one checked to return a readable error, change nothing, and not raise. Table-driven tests like this are a cheap way to cover all the strange things a model might send.

:::keypoints
- A tool is a *definition* Claude reads (name, description, schema) plus a *function* you run. Claude only ever asks.
- Descriptions are part of the prompt. Say when to use the tool, what each input means and what not to do.
- A Pydantic model gives you the schema and the validation from one definition, so they cannot drift apart.
- Model input is untrusted: validate it, and turn every failure into a clear message the model can act on. Nothing raises.
- Tell "not given" from "given as null" with `model_fields_set`.
:::

```quiz
? Where does a tool's description get used?
- It is shown only in the web page
+ It is part of what Claude reads, and guides when and how it calls the tool
- It is ignored; only the name matters
> Descriptions are the instructions for using the tool. Vague ones produce wrong calls.
? Claude calls `update_task` with `id: 42` but there is no such task. What should the toolbox do?
- Raise an exception
- Create task 42
+ Return an error message that says to call list_tasks, so Claude can try again
> Errors are sent back as results. A good message turns a failure into a retry.
? Why generate the JSON Schema from the Pydantic model instead of writing both by hand?
+ So the menu Claude reads and the check your code applies cannot drift apart
- Because the API cannot accept hand-written schemas
- To make the schema shorter
> One definition, two jobs.
```

:::exercise A search tool
Add a `search_tasks` tool: input `text` (2 to 60 characters), output the matching tasks as lines. Add its model to `inputs`, its entry to `TOOLS`, its handler to `ToolBox`, and tests: a hit, a miss ("No tasks match."), an input that is too short. When a user says "do I have anything about the plumber?", why is `search_tasks` better than making the model call `list_tasks` and scan the lines?
:::
