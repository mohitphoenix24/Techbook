"""Checking that what the model cites is real: the file exists, the lines exist, and the model was actually shown them."""
# region: imports
import re
from dataclasses import dataclass

from .chunker import Chunk
# endregion: imports

# region: citations
CITATION = re.compile(r"\[([\w./\-]+):(\d+)(?:-(\d+))?\]")


@dataclass(frozen=True)
class Citation:
    path: str
    start: int
    end: int
    status: str        # valid | outside_context | bad_lines | no_such_file


def validate(answer: str, files: dict[str, str], shown: list[Chunk]) -> list[Citation]:
    """Every [path:start-end] in the answer, with a verdict.

    valid            the file and lines exist, and they overlap code the model was shown
    outside_context  they exist, but the model was never shown that code: it is remembering or guessing
    bad_lines        the lines do not exist in that file
    no_such_file     there is no such file in the repository
    """
    out, seen = [], set()
    for m in CITATION.finditer(answer):
        path, start = m.group(1), int(m.group(2))
        end = int(m.group(3) or start)
        if (path, start, end) in seen:
            continue
        seen.add((path, start, end))
        if path not in files:
            status = "no_such_file"
        elif not 1 <= start <= end <= max(1, len(files[path].splitlines())):
            status = "bad_lines"
        elif any(c.path == path and c.start <= end and start <= c.end for c in shown):
            status = "valid"
        else:
            status = "outside_context"
        out.append(Citation(path, start, end, status))
    return out
# endregion: citations
