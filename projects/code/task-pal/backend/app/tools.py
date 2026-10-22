"""The agent's hands: five tools. Each has (1) a description Claude reads, (2) an input model that checks what Claude sends,
(3) a function that does the work. Claude only ever *asks* for a tool; this file is what actually runs."""
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError

from .store import TaskStore

log = logging.getLogger(__name__)


# region: inputs
class AddTask(BaseModel):
    title: str = Field(min_length=1, max_length=120, description="A short title, such as 'Pay the electricity bill'.")
    due: date | None = Field(default=None, description="Due date as YYYY-MM-DD. Leave it out when the user gave no date.")
    priority: Literal["low", "normal", "high"] = Field(default="normal", description="Use 'high' only if the user says it is urgent or important.")


class ListTasks(BaseModel):
    status: Literal["open", "done", "all"] = Field(default="open", description="Which tasks to list. Most questions are about 'open' ones.")
    due_before: date | None = Field(default=None, description="Only tasks due on or before this date (YYYY-MM-DD). Tasks without a date are left out.")
    priority: Literal["low", "normal", "high"] | None = Field(default=None, description="Only tasks with this priority.")


class UpdateTask(BaseModel):
    id: int = Field(description="The task's id, from list_tasks or add_task. Never guess an id: list the tasks first.")
    title: str | None = Field(default=None, min_length=1, max_length=120, description="A new title.")
    due: date | None = Field(default=None, description="A new due date (YYYY-MM-DD). Send null to remove the date.")
    priority: Literal["low", "normal", "high"] | None = Field(default=None, description="A new priority.")
    done: bool | None = Field(default=None, description="true marks the task finished, false re-opens it.")


class DeleteTask(BaseModel):
    id: int = Field(description="The id of the task to delete for good. Prefer update_task(done=true) for finished tasks.")


class GetToday(BaseModel):
    """No inputs: the tool only tells the model today's date."""
# endregion: inputs


# region: definitions
def schema_of(model: type[BaseModel]) -> dict:
    """The JSON Schema Claude reads, made from the same model that validates the input (one source of truth)."""
    def clean(node: Any) -> Any:
        if isinstance(node, dict):
            return {k: clean(v) for k, v in node.items() if not (k == "title" and isinstance(v, str))}     # drop the generated "title"s, keep a property called title
        return [clean(v) for v in node] if isinstance(node, list) else node
    return clean(model.model_json_schema())


TOOLS: list[dict] = [
    {"name": "get_today", "description": "Today's date and weekday. Call this before working out any relative date such as 'tomorrow', 'next Friday' or 'this week'. You do not know the date yourself.",
     "input_schema": schema_of(GetToday)},
    {"name": "list_tasks", "description": "List tasks, ordered by due date. Use it to answer questions about the list and to find a task's id before changing it.",
     "input_schema": schema_of(ListTasks)},
    {"name": "add_task", "description": "Add one new task to the list. Call it once per task.",
     "input_schema": schema_of(AddTask)},
    {"name": "update_task", "description": "Change one task: rename it, move its date, change its priority, or mark it done or not done. Only send the fields that change.",
     "input_schema": schema_of(UpdateTask)},
    {"name": "delete_task", "description": "Permanently delete one task. This cannot be undone.",
     "input_schema": schema_of(DeleteTask)},
]
# endregion: definitions


@dataclass
class ToolResult:
    content: str             # what the MODEL sees
    ok: bool = True
    summary: str = ""        # what the person sees in the step list
    changed: bool = False    # did the task list change? the browser refreshes its board when so


# region: toolbox
class ToolBox:
    def __init__(self, store: TaskStore, today: Callable[[], date]):
        self.store, self.today = store, today
        self._run: dict[str, tuple[type[BaseModel], Callable[[Any], ToolResult]]] = {
            "get_today": (GetToday, self._get_today),
            "list_tasks": (ListTasks, self._list_tasks),
            "add_task": (AddTask, self._add_task),
            "update_task": (UpdateTask, self._update_task),
            "delete_task": (DeleteTask, self._delete_task),
        }

    def call(self, name: str, raw_input: dict) -> ToolResult:
        """Run a tool the model asked for. The model's input is untrusted: validate it, and turn every failure into a
        message the model can read and react to. Nothing here raises."""
        if name not in self._run:
            return ToolResult(f"Error: there is no tool called '{name}'. Available tools: {', '.join(self._run)}.", False, "unknown tool")
        model, handler = self._run[name]
        try:
            args = model.model_validate(raw_input)
        except ValidationError as exc:
            problems = "; ".join(f"{'.'.join(str(p) for p in e['loc']) or 'input'}: {e['msg']}" for e in exc.errors())
            return ToolResult(f"Error: invalid input. {problems}. Fix the input and try again.", False, "invalid input")
        try:
            return handler(args)
        except Exception:                                  # a bug or a failing disk must not take the whole agent down
            log.exception("tool %s failed", name)
            return ToolResult("Error: the tool failed unexpectedly, and nothing was changed. Tell the user it could not be done.", False, "tool failed")

    def _get_today(self, _: GetToday) -> ToolResult:
        day = self.today()
        return ToolResult(f"Today is {day.isoformat()}, a {day.strftime('%A')}.", summary=day.strftime("%A %d %B %Y"))

    def _list_tasks(self, a: ListTasks) -> ToolResult:
        rows = self.store.list(a.status, a.due_before.isoformat() if a.due_before else None, a.priority)
        shown = rows[:50]                                              # a cap, so a huge list cannot flood the model
        text = "\n".join(_line(t) for t in shown) or "No tasks match."
        if len(rows) > len(shown):
            text += f"\n(showing {len(shown)} of {len(rows)})"
        return ToolResult(text, summary=f"{len(rows)} task{'s' if len(rows) != 1 else ''}")

    def _add_task(self, a: AddTask) -> ToolResult:
        task = self.store.add(a.title, a.due.isoformat() if a.due else None, a.priority)
        return ToolResult(f"Added: {_line(task)}", summary=f"added #{task['id']}", changed=True)

    def _update_task(self, a: UpdateTask) -> ToolResult:
        fields: dict[str, Any] = {k: getattr(a, k) for k in a.model_fields_set if k != "id"}
        if "due" in fields and fields["due"] is not None:
            fields["due"] = fields["due"].isoformat()
        fields = {k: v for k, v in fields.items() if v is not None or k == "due"}          # null only means something for `due`
        if not fields:
            return ToolResult("Error: nothing to change. Send at least one of title, due, priority, done.", False, "nothing to change")
        task = self.store.update(a.id, **fields)
        if task is None:
            return ToolResult(f"Error: there is no task with id {a.id}. Call list_tasks to see the ids.", False, f"no task #{a.id}")
        return ToolResult(f"Updated: {_line(task)}", summary=f"updated #{task['id']}", changed=True)

    def _delete_task(self, a: DeleteTask) -> ToolResult:
        task = self.store.get(a.id)
        if task is None or not self.store.delete(a.id):
            return ToolResult(f"Error: there is no task with id {a.id}. Call list_tasks to see the ids.", False, f"no task #{a.id}")
        return ToolResult(f"Deleted: {_line(task)}", summary=f"deleted #{a.id}", changed=True)


def _line(t: dict) -> str:
    """One task as one line of text: compact for the model, readable for a person."""
    return f"#{t['id']} [{'x' if t['done'] else ' '}] {t['title']} (due {t['due'] or 'no date'}, {t['priority']} priority)"
# endregion: toolbox
