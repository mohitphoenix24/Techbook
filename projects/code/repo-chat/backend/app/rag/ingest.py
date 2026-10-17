"""Reading a repository safely: from a folder on disk, or from a ZIP someone uploaded.

An uploaded ZIP is untrusted input. It can lie about its size (a "ZIP bomb" a few kilobytes long that expands to
gigabytes), contain paths that try to escape the folder ("../../etc/passwd"), hold thousands of files, or hold binary
files that are not source code. Everything below exists to refuse or skip those, and nothing is ever written to disk:
files are read into memory, so a path cannot overwrite anything.
"""
# region: imports
import io
import posixpath
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from .secrets import mask_secrets
# endregion: imports


class RepoError(ValueError):
    """A repository we cannot or will not read. The message is safe to show to the person who uploaded it."""


# region: limits
@dataclass(frozen=True)
class Limits:
    max_zip_bytes: int = 5_000_000          # the uploaded file itself
    max_files: int = 400                    # source files kept
    max_file_bytes: int = 200_000           # one file; larger ones (generated code, data dumps) are skipped
    max_total_bytes: int = 4_000_000        # all kept files together: the real defence against a ZIP bomb


TEXT_EXTENSIONS = {".py", ".md", ".rst", ".txt", ".js", ".jsx", ".ts", ".tsx", ".json", ".toml", ".yaml", ".yml", ".cfg", ".ini",
                   ".go", ".java", ".rb", ".rs", ".c", ".h", ".cpp", ".sh", ".sql", ".html", ".css"}
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", ".idea", ".mypy_cache", ".pytest_cache", ".tox"}
# endregion: limits


@dataclass(frozen=True)
class SourceFile:
    path: str          # always relative, always with forward slashes
    text: str


@dataclass
class ReadResult:
    files: list[SourceFile]
    skipped: list[tuple[str, str]] = field(default_factory=list)       # (path, why), so people can see what was left out
    masked: int = 0                                                    # secrets replaced by [REDACTED] on the way in


# region: clean-path
def clean_path(raw: str) -> str:
    """A safe relative path, or a RepoError. Rejects absolute paths, '..', drive letters, backslashes and NUL bytes."""
    if "\x00" in raw or "\\" in raw:
        raise RepoError(f"Unsafe file name in the archive: {raw[:60]!r}")
    path = posixpath.normpath(raw)
    if path.startswith("/") or path == "." or ":" in path.split("/")[0] or any(part == ".." for part in path.split("/")):
        raise RepoError(f"Unsafe file path in the archive: {raw[:60]!r}")
    return path
# endregion: clean-path


def _wanted(path: str) -> str | None:
    """Why this file should be skipped, or None to keep it."""
    parts = path.split("/")
    if any(p in SKIP_DIRS or p.startswith(".") and p not in (".github",) for p in parts[:-1]):
        return "in a folder that is not source (hidden, vendored or built)"
    if Path(path).suffix.lower() not in TEXT_EXTENSIONS:
        return "not a source or text file"
    return None


# region: read-zip
def read_zip(data: bytes, limits: Limits = Limits()) -> ReadResult:
    """Read a ZIP from memory with every limit enforced, and without ever extracting it to disk."""
    if len(data) > limits.max_zip_bytes:
        raise RepoError(f"The ZIP is too large ({len(data) // 1000} KB). The limit is {limits.max_zip_bytes // 1000} KB.")
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise RepoError("That is not a valid ZIP file.") from None

    entries: list[tuple[str, zipfile.ZipInfo]] = []
    for info in archive.infolist():
        if info.is_dir():
            continue
        if (info.external_attr >> 16) & 0o170000 == 0o120000:             # a symbolic link: never follow it
            continue
        entries.append((clean_path(info.filename), info))                  # raises on the first unsafe path: refuse the whole archive

    prefix = _common_folder([p for p, _ in entries])                       # GitHub ZIPs wrap everything in "repo-main/"
    result, total = ReadResult([]), 0
    for path, info in sorted(entries):
        path = path[len(prefix):]
        why = _wanted(path)
        if why:
            result.skipped.append((path, why))
            continue
        with archive.open(info) as handle:
            raw = handle.read(limits.max_file_bytes + 1)                   # read at most one byte past the limit, whatever the ZIP claims
        if len(raw) > limits.max_file_bytes:
            result.skipped.append((path, "file is too large"))
            continue
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            result.skipped.append((path, "not UTF-8 text"))
            continue
        if "\x00" in text:
            result.skipped.append((path, "binary content"))
            continue
        if len(result.files) >= limits.max_files:
            result.skipped.append((path, f"more than {limits.max_files} files"))
            continue
        if total + len(raw) > limits.max_total_bytes:
            raise RepoError(f"The source files add up to more than {limits.max_total_bytes // 1000} KB. Upload a smaller repository.")
        total += len(raw)
        text, found = mask_secrets(text)
        result.masked += found
        result.files.append(SourceFile(path, text))
    if not result.files:
        raise RepoError("No readable source files were found in that ZIP.")
    return result


def _common_folder(paths: list[str]) -> str:
    firsts = {p.split("/")[0] for p in paths if "/" in p}
    if paths and len(firsts) == 1 and all("/" in p for p in paths):
        return next(iter(firsts)) + "/"
    return ""
# endregion: read-zip


# region: directory
def read_directory(root: Path, limits: Limits = Limits()) -> ReadResult:
    """Read a trusted folder on this machine (the built-in sample repository)."""
    result = ReadResult([])
    for file in sorted(p for p in root.rglob("*") if p.is_file()):
        path = file.relative_to(root).as_posix()
        why = _wanted(path)
        if why:
            result.skipped.append((path, why))
        elif file.stat().st_size > limits.max_file_bytes:
            result.skipped.append((path, "file is too large"))
        else:
            text, found = mask_secrets(file.read_text(encoding="utf-8"))
            result.masked += found
            result.files.append(SourceFile(path, text))
    return result
# endregion: directory
