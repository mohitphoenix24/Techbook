"""The agent's hands. Three tools READ the notes. The fourth, propose_change, cannot change anything: it only writes down a
request that a person must approve. That is the whole safety design, and it lives in what the tools are able to do."""
import logging
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError

from .notes import NoteError, Notes
from .proposals import Proposals

log = logging.getLogger(__name__)


# region: inputs
class ListNotes(BaseModel):
    """No inputs: lists every note."""


class ReadNote(BaseModel):
    name: str = Field(description="The note's name exactly as list_notes shows it, without '.md', such as 'trip-ideas'.")


class SearchNotes(BaseModel):
    query: str = Field(min_length=2, max_length=100, description="Text to look for, ignoring case. It matches whole lines, not meanings: use one or two distinctive words.")


class ProposeChange(BaseModel):
    action: Literal["create", "replace", "append", "delete"] = Field(description="create: a new note. replace: overwrite a whole note. append: add text at the end. delete: remove a note.")
    name: str = Field(description="The note's name, such as 'trip-ideas'. For create: 1 to 64 lower-case letters, digits, '-' or '_'.")
    content: str | None = Field(default=None, max_length=20_000, description="The full text of the note (create, replace) or the text to add (append). Leave out for delete.")
    reason: str = Field(min_length=3, max_length=200, description="One short sentence telling the user why, shown beside the change.")
# endregion: inputs


# region: definitions
def schema_of(model: type[BaseModel]) -> dict:
    """The JSON Schema Claude reads, made from the same model that validates the input (one source of truth)."""
    def clean(node: Any) -> Any:
        if isinstance(node, dict):
            return {k: clean(v) for k, v in node.items() if not (k == "title" and isinstance(v, str))}     # drop the generated "title"s
        return [clean(v) for v in node] if isinstance(node, list) else node
    return clean(model.model_json_schema())


TOOLS: list[dict] = [
    {"name": "list_notes", "description": "List the names of all notes, with each note's title and size. Call this first when you do not know a note's name.",
     "input_schema": schema_of(ListNotes)},
    {"name": "read_note", "description": "Read the full text of one note.",
     "input_schema": schema_of(ReadNote)},
    {"name": "search_notes", "description": "Find lines containing some text across all notes. Returns note name, line number and the line. Use it to find which note mentions something.",
     "input_schema": schema_of(SearchNotes)},
    {"name": "propose_change", "description": "Propose creating, replacing, appending to or deleting a note. This does NOT change the note: it saves a proposal that the user will see as a diff "
     "and must approve. Read the note first when changing an existing one. One proposal per note; put the complete new text in a replace.",
     "input_schema": schema_of(ProposeChange)},
]
# endregion: definitions


@dataclass
class ToolResult:
    content: str                        # what the MODEL sees
    ok: bool = True
    summary: str = ""                   # what the person sees in the step list
    changed: bool = False               # did the list of proposals change? the browser reloads it when so


# region: toolbox
class ToolBox:
    def __init__(self, notes: Notes, proposals: Proposals):
        self.notes, self.proposals = notes, proposals

    def call(self, name: str, raw_input: dict[str, Any]) -> ToolResult:
        """Run a tool the model asked for. The input is untrusted: validate it, and turn every failure into a message the model can read. Nothing here raises."""
        models = {"list_notes": ListNotes, "read_note": ReadNote, "search_notes": SearchNotes, "propose_change": ProposeChange}
        if name not in models:
            return ToolResult(f"Error: there is no tool called '{name}'. Available tools: {', '.join(models)}.", False, "unknown tool")
        try:
            args = models[name].model_validate(raw_input)
            return getattr(self, f"_{name}")(args)
        except ValidationError as exc:
            problems = "; ".join(f"{'.'.join(str(p) for p in e['loc']) or 'input'}: {e['msg']}" for e in exc.errors())
            return ToolResult(f"Error: invalid input. {problems}. Fix the input and try again.", False, "invalid input")
        except NoteError as exc:
            return ToolResult(f"Error: {exc}", False, "refused")
        except Exception:                                  # a bug or a failing disk must not take the whole agent down
            log.exception("tool %s failed", name)
            return ToolResult("Error: the tool failed unexpectedly and nothing was changed. Tell the user it could not be done.", False, "tool failed")

    def _list_notes(self, _: ListNotes) -> ToolResult:
        info = self.notes.info()
        text = "\n".join(f"{n['name']}: \"{n['title']}\" ({n['chars']:,} characters)" for n in info) or "There are no notes yet."
        return ToolResult(text, summary=f"{len(info)} notes")

    def _read_note(self, a: ReadNote) -> ToolResult:
        text = self.notes.read(a.name)
        return ToolResult(text, summary=f"{len(text):,} characters")

    def _search_notes(self, a: SearchNotes) -> ToolResult:
        hits = self.notes.search(a.query)
        if not hits:
            return ToolResult(f"No line contains '{a.query}'. Try a different word.", summary="no matches")
        return ToolResult("\n".join(f"{n}:{i}: {line}" for n, i, line in hits), summary=f"{len(hits)} match{'es' if len(hits) != 1 else ''}")

    def _propose_change(self, a: ProposeChange) -> ToolResult:
        p = self.proposals.add(self.notes, a.action, a.name, a.content, a.reason)      # records a request: no note is touched
        return ToolResult(f"Proposal #{p.id} saved: {a.action} '{a.name}'. It is waiting for the user to approve it and has NOT been applied. "
                          f"Tell the user it is waiting for their approval; do not say it is done.", summary=f"proposal #{p.id}: {a.action} {a.name}", changed=True)
# endregion: toolbox
