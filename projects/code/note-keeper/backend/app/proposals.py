"""Proposals: what the agent is allowed to do instead of editing. A proposal is a *request* for a change, kept in memory with a
diff, until a person applies or rejects it. Only `apply` ever writes to a note, and only the person can call it."""
import difflib
import hashlib
from dataclasses import dataclass
from typing import Literal

from .notes import NoteError, Notes

Action = Literal["create", "replace", "append", "delete"]


def fingerprint(text: str | None) -> str | None:
    return hashlib.sha256(text.encode()).hexdigest()[:16] if text is not None else None


# region: after
def result_of(action: str, before: str | None, content: str | None) -> str | None:
    """What the note would contain after the change (None means the note is gone)."""
    if action == "delete":
        return None
    if action in ("create", "replace"):
        return content or ""
    base = before or ""
    return base + ("" if not base or base.endswith("\n") else "\n") + (content or "") + ("" if (content or "").endswith("\n") else "\n")


def diff_of(name: str, before: str | None, after: str | None) -> str:
    """A unified diff, the format every code review uses: lines starting with '-' go, lines starting with '+' arrive."""
    a = (before or "").splitlines(keepends=True)
    b = (after or "").splitlines(keepends=True)
    label = f"{name}.md"
    lines = difflib.unified_diff(a, b, fromfile=label if before is not None else "(new note)", tofile=label if after is not None else "(deleted)", n=2)
    return "".join(l if l.endswith("\n") else l + "\n" for l in lines)
# endregion: after


@dataclass
class Proposal:
    id: int
    action: Action
    name: str
    content: str | None
    reason: str
    diff: str
    base: str | None                            # fingerprint of the note when the proposal was made (None: it did not exist)
    status: Literal["pending", "applied", "rejected"] = "pending"

    def public(self) -> dict:
        return {"id": self.id, "action": self.action, "name": self.name, "reason": self.reason, "diff": self.diff, "status": self.status}


# region: store
class Proposals:
    def __init__(self, max_pending: int = 20):
        self._items: dict[int, Proposal] = {}
        self._next = 1
        self.max_pending = max_pending                  # a person can only review so many: past this, the agent must wait

    def add(self, notes: Notes, action: Action, name: str, content: str | None, reason: str) -> Proposal:
        """Check the proposal against the folder *now* and record it. Nothing is written."""
        if sum(1 for p in self._items.values() if p.status == "pending") >= self.max_pending:
            raise NoteError(f"{self.max_pending} proposals are already waiting for the user. Ask them to review those before proposing more.")
        exists = notes.exists(name)
        if action == "create" and exists:
            raise NoteError(f"A note called '{name}' already exists. Use action 'replace' or 'append' to change it.")
        if action != "create" and not exists:
            raise NoteError(f"There is no note called '{name}'. Call list_notes to see the names, or use action 'create'.")
        if action in ("create", "replace", "append") and not content:
            raise NoteError(f"Action '{action}' needs the content to write.")
        before = notes.read(name) if exists else None
        after = result_of(action, before, content)
        if after is not None and len(after) > notes.max_chars:
            raise NoteError(f"The note would be {len(after):,} characters; the limit is {notes.max_chars:,}.")
        p = Proposal(self._next, action, name, content, reason, diff_of(name, before, after), fingerprint(before))
        self._items[p.id] = p
        self._next += 1
        return p

    def get(self, pid: int) -> Proposal | None:
        return self._items.get(pid)

    def all(self) -> list[Proposal]:
        return list(self._items.values())

    def apply(self, pid: int, notes: Notes) -> Proposal:
        """The only way a note changes. Refuses a proposal that is not pending, and one made stale by an edit since it was written."""
        p = self._items.get(pid)
        if p is None:
            raise NoteError(f"There is no proposal #{pid}.")
        if p.status != "pending":
            raise NoteError(f"Proposal #{pid} was already {p.status}.")
        before = notes.read(p.name) if notes.exists(p.name) else None
        if fingerprint(before) != p.base:
            raise NoteError(f"The note '{p.name}' changed after this was proposed, so applying it could overwrite newer work. Ask for a fresh proposal.")
        after = result_of(p.action, before, p.content)
        if after is None:
            notes.delete(p.name)
        else:
            notes.write(p.name, after)
        p.status = "applied"
        return p

    def reject(self, pid: int) -> Proposal:
        p = self._items.get(pid)
        if p is None:
            raise NoteError(f"There is no proposal #{pid}.")
        if p.status != "pending":
            raise NoteError(f"Proposal #{pid} was already {p.status}.")
        p.status = "rejected"
        return p
# endregion: store
