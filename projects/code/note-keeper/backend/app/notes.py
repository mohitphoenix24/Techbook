"""A folder of Markdown notes, and the rules that keep every operation inside it. No AI in this file.

The agent never sees a file path. It sees note NAMES ("meeting-2026-10-12"), and this class is the only code that turns a name
into a path, so there is exactly one place to get path safety right."""
import re
from pathlib import Path


class NoteError(Exception):
    """A rule was broken. The message is written for the model (and the person) to read."""


# region: names
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def clean_name(name: str) -> str:
    """'Ideas.md' is accepted as 'ideas'. Anything that is not a plain lower-case name is refused, whatever the reason."""
    n = name.strip()
    if n.endswith(".md"):
        n = n[:-3]
    if not NAME_RE.match(n):
        raise NoteError(f"'{name}' is not a valid note name. Use 1 to 64 lower-case letters, digits, '-' or '_', such as 'trip-ideas'. No slashes or dots.")
    return n
# endregion: names


# region: notes
class Notes:
    def __init__(self, root: str | Path, max_chars: int = 20_000, max_notes: int = 200):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.max_chars, self.max_notes = max_chars, max_notes

    def _path(self, name: str) -> Path:
        """Name -> path, with three independent checks. Any one of them would stop a '../' trick; together they stop a surprise."""
        path = self.root / f"{clean_name(name)}.md"                  # 1. the name has no slash and no dot, so no '..'
        if path.is_symlink():                                        # 2. a symlink could point anywhere: refuse it
            raise NoteError(f"'{name}' is not an ordinary note.")
        if path.resolve().parent != self.root:                       # 3. whatever happened above, the real location must be this folder
            raise NoteError(f"'{name}' is outside the notes folder.")
        return path

    def names(self) -> list[str]:
        return sorted(p.stem for p in self.root.glob("*.md") if p.is_file() and not p.is_symlink() and NAME_RE.match(p.stem))

    def exists(self, name: str) -> bool:
        return self._path(name).is_file()

    def read(self, name: str) -> str:
        path = self._path(name)
        if not path.is_file():
            raise NoteError(f"There is no note called '{clean_name(name)}'. Call list_notes to see the names.")
        try:
            return path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            raise NoteError(f"The note '{clean_name(name)}' could not be read (it is not valid UTF-8 text).") from None

    def write(self, name: str, content: str) -> None:
        path = self._path(name)
        if len(content) > self.max_chars:
            raise NoteError(f"That note would be {len(content):,} characters; the limit is {self.max_chars:,}.")
        if not path.exists() and len(self.names()) >= self.max_notes:
            raise NoteError(f"The folder already holds {self.max_notes} notes, which is the limit.")
        try:
            path.write_text(content, encoding="utf-8")
        except OSError:
            raise NoteError(f"The note '{clean_name(name)}' could not be written.") from None

    def delete(self, name: str) -> None:
        path = self._path(name)
        if not path.is_file():
            raise NoteError(f"There is no note called '{clean_name(name)}'.")
        try:
            path.unlink()
        except OSError:
            raise NoteError(f"The note '{clean_name(name)}' could not be deleted.") from None

    def search(self, query: str, limit: int = 20) -> list[tuple[str, int, str]]:
        """(note, line number, line) for every line containing the text, ignoring case."""
        q, hits = query.lower(), []
        for name in self.names():
            try:
                text = self.read(name)
            except NoteError:
                continue
            for i, line in enumerate(text.splitlines(), start=1):
                if q in line.lower():
                    hits.append((name, i, line.strip()[:160]))
                    if len(hits) >= limit:
                        return hits
        return hits

    def info(self) -> list[dict]:
        """For the sidebar: name, first heading and size of every note."""
        out = []
        for name in self.names():
            try:
                text = self.read(name)
            except NoteError:                                  # one unreadable file must not hide all the others
                continue
            first = next((l.lstrip("# ").strip() for l in text.splitlines() if l.strip()), name)
            out.append({"name": name, "title": first[:80], "chars": len(text)})
        return out
# endregion: notes
