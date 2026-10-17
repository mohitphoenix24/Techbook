"""Cutting source files into pieces that mean something: a function, a method, a class, a section of a README.

A fixed window of 500 characters cuts functions in half and glues unrelated code together. Code has structure, and
Python's own parser (the `ast` module) tells us exactly where every function and class starts and ends.
"""
# region: imports
import ast
import re
from dataclasses import dataclass

from .ingest import SourceFile
# endregion: imports


# region: chunk
@dataclass(frozen=True)
class Chunk:
    id: str                      # "jobq/worker.py:70-82": a path and a line range, which is also exactly how it is cited
    path: str
    kind: str                    # module | class | function | method | doc | code | file
    name: str                    # qualified: "Worker._handle_failure", or "README.md > How retries work"
    start: int                   # 1-based, inclusive
    end: int
    text: str                    # the source lines exactly as written
    signature: str = ""          # "def backoff_delay(attempt, policy, rng) -> float"
    doc: str = ""                # the first paragraph of the docstring
    calls: tuple[str, ...] = ()  # the names this code calls, for the call graph


def _make(path: str, kind: str, name: str, start: int, end: int, lines: list[str], **extra) -> Chunk:
    return Chunk(f"{path}:{start}-{end}", path, kind, name, start, end, "\n".join(lines[start - 1:end]), **extra)
# endregion: chunk


# region: python
MAX_WHOLE_CLASS_LINES = 25      # a class this short stays in one piece; a longer one is split into its methods


def _calls(node: ast.AST) -> tuple[str, ...]:
    """Dotted names of everything called inside `node`: 'backoff_delay', 'self.storage.mark_failed', 'json.dumps'."""
    names: list[str] = []
    for child in ast.walk(node):
        if isinstance(child, ast.Call):
            parts, target = [], child.func
            while isinstance(target, ast.Attribute):
                parts.append(target.attr)
                target = target.value
            if isinstance(target, ast.Name):
                names.append(".".join([target.id, *reversed(parts)]))
    return tuple(dict.fromkeys(names))


def _signature(node: ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef) -> str:
    if isinstance(node, ast.ClassDef):
        bases = ", ".join(ast.unparse(b) for b in node.bases)
        return f"class {node.name}({bases})" if bases else f"class {node.name}"
    prefix = "async def" if isinstance(node, ast.AsyncFunctionDef) else "def"
    returns = f" -> {ast.unparse(node.returns)}" if node.returns else ""
    return f"{prefix} {node.name}({ast.unparse(node.args)}){returns}"


def _first_paragraph(node) -> str:
    doc = ast.get_docstring(node) or ""
    return " ".join(doc.split("\n\n")[0].split())


def _start(node) -> int:
    """The first line of a definition, including its decorators."""
    return min([node.lineno, *(d.lineno for d in getattr(node, "decorator_list", []))])


def chunk_python(file: SourceFile) -> list[Chunk]:
    text, path = file.text, file.path
    lines = text.splitlines()
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return chunk_lines(file)                                  # code that does not parse is still searchable
    module = path[:-3].replace("/", ".")
    chunks: list[Chunk] = []
    covered = [False] * (len(lines) + 2)

    def add(kind, name, start, end, node=None, calls=None):
        if end < start:
            return
        for n in range(start, end + 1):
            covered[n] = True
        chunks.append(_make(path, kind, name, start, end, lines, signature=_signature(node) if node else "",
                            doc=_first_paragraph(node) if node else "", calls=calls if calls is not None else (_calls(node) if node else ())))

    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            add("function", node.name, _start(node), node.end_lineno, node)
        elif isinstance(node, ast.ClassDef):
            first, last = _start(node), node.end_lineno
            methods = [m for m in node.body if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef))]
            if last - first + 1 <= MAX_WHOLE_CLASS_LINES or not methods:
                add("class", node.name, first, last, node)
            else:
                add("class", node.name, first, _start(methods[0]) - 1, node, calls=())    # the header: docstring and attributes (the methods own their calls)
                for m in methods:
                    add("method", f"{node.name}.{m.name}", _start(m), m.end_lineno, m)

    # everything not inside a definition: imports, the module docstring, constants
    run: list[int] = []
    for n in range(1, len(lines) + 2):
        if n <= len(lines) and not covered[n]:
            run.append(n)
            continue
        body = [lines[i - 1] for i in run if lines[i - 1].strip()]
        if len(body) >= 2:
            add("module", module, run[0], run[-1])
        run = []
    return sorted(chunks, key=lambda c: c.start)
# endregion: python


# region: markdown
def chunk_markdown(file: SourceFile) -> list[Chunk]:
    """One chunk per heading section, named by its heading path: 'README.md > How retries work'."""
    lines, path = file.text.splitlines(), file.path
    marks: list[tuple[int, int, str]] = []                        # (line, level, title)
    in_fence = False
    for n, line in enumerate(lines, start=1):
        if line.strip().startswith("```"):
            in_fence = not in_fence
        elif not in_fence and (m := re.match(r"^(#{1,6})\s+(.*\S)\s*$", line)):
            marks.append((n, len(m.group(1)), m.group(2)))
    if not marks:
        return chunk_lines(file)
    chunks, trail = [], []
    if marks[0][0] > 1 and any(l.strip() for l in lines[:marks[0][0] - 1]):
        chunks.append(_make(path, "doc", path, 1, marks[0][0] - 1, lines))
    for i, (start, level, title) in enumerate(marks):
        end = (marks[i + 1][0] - 1) if i + 1 < len(marks) else len(lines)
        while end > start and not lines[end - 1].strip():
            end -= 1
        trail = [t for t in trail if t[0] < level] + [(level, title)]
        if end > start:                                           # a heading with nothing under it is not worth a chunk
            chunks.append(_make(path, "doc", f"{path} > " + " > ".join(t for _, t in trail), start, end, lines, doc=title))
    return chunks
# endregion: markdown


# region: lines
def chunk_lines(file: SourceFile, size: int = 40, lookback: int = 10) -> list[Chunk]:
    """The fallback for languages we cannot parse: windows of about `size` lines, cut at a blank line where possible."""
    lines, path, chunks, start = file.text.splitlines(), file.path, [], 1
    while start <= len(lines):
        end = min(start + size - 1, len(lines))
        if end < len(lines):
            for cut in range(end, max(start, end - lookback), -1):
                if not lines[cut - 1].strip():
                    end = cut
                    break
        if any(l.strip() for l in lines[start - 1:end]):
            chunks.append(_make(path, "code", "", start, end, lines))
        start = end + 1
    return chunks
# endregion: lines


def chunk_file(file: SourceFile) -> list[Chunk]:
    if file.path.endswith(".py"):
        return chunk_python(file)
    if file.path.endswith((".md", ".rst")):
        return chunk_markdown(file)
    return chunk_lines(file)


def chunk_repo(files: list[SourceFile]) -> list[Chunk]:
    return [chunk for file in files for chunk in chunk_file(file)]


def whole_file_chunks(files: list[SourceFile]) -> list[Chunk]:
    """The naive baseline for comparison: one chunk per file."""
    return [Chunk(f"{f.path}:1-{max(1, len(f.text.splitlines()))}", f.path, "file", f.path, 1, max(1, len(f.text.splitlines())), f.text) for f in files]
