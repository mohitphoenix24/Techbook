"""Repositories held in memory: the files, their chunks, the search index and the call graph, built once when a repo arrives."""
import hashlib
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from .rag.chunker import Chunk, chunk_repo
from .rag.graph import CallGraph
from .rag.index import CodeIndex
from .rag.ingest import Limits, RepoError, SourceFile, read_directory

SAMPLE_DIR = Path(__file__).parent / "sample_repo"


# region: repo
@dataclass
class Repo:
    id: str
    name: str
    files: dict[str, str]
    chunks: list[Chunk]
    index: CodeIndex
    graph: CallGraph
    skipped: list[tuple[str, str]] = field(default_factory=list)
    builtin: bool = False
    masked: int = 0

    def summary(self) -> dict:
        languages = Counter(Path(p).suffix.lstrip(".") or "other" for p in self.files)
        return {"id": self.id, "name": self.name, "builtin": self.builtin, "files": len(self.files), "chunks": len(self.chunks),
                "lines": sum(len(t.splitlines()) for t in self.files.values()), "languages": dict(languages.most_common()),
                "secrets_masked": self.masked, "skipped": len(self.skipped), "skipped_examples": [{"path": p, "why": w} for p, w in self.skipped[:12]]}


def build_repo(name: str, files: list[SourceFile], skipped: list[tuple[str, str]] | None = None, *, repo_id: str | None = None, builtin: bool = False, masked: int = 0) -> Repo:
    """Chunk every file, then build the search index and the call graph from the chunks."""
    digest = hashlib.sha1("".join(f"{f.path}\x00{f.text}" for f in files).encode()).hexdigest()[:8]
    chunks = chunk_repo(files)
    return Repo(repo_id or f"repo-{digest}", name, {f.path: f.text for f in files}, chunks, CodeIndex(chunks), CallGraph(chunks), skipped or [], builtin, masked)


def load_sample(limits: Limits = Limits()) -> Repo:
    result = read_directory(SAMPLE_DIR, limits)
    return build_repo("jobq (sample)", result.files, result.skipped, repo_id="sample", builtin=True, masked=result.masked)
# endregion: repo


class RepoStore:
    def __init__(self, max_repos: int = 5):
        self.max_repos = max_repos
        self._repos: dict[str, Repo] = {}

    def add(self, repo: Repo) -> Repo:
        """Keep a repository. The same content added twice is the same repository; too many uploads are refused."""
        if repo.id in self._repos:
            return self._repos[repo.id]
        if sum(not r.builtin for r in self._repos.values()) >= self.max_repos and not repo.builtin:
            raise RepoError(f"You already have {self.max_repos} uploaded repositories. Remove one first.")
        self._repos[repo.id] = repo
        return repo

    def get(self, repo_id: str) -> Repo | None:
        return self._repos.get(repo_id)

    def remove(self, repo_id: str) -> bool:
        repo = self._repos.get(repo_id)
        if repo is None or repo.builtin:
            return False
        del self._repos[repo_id]
        return True

    def list(self) -> list[Repo]:
        return sorted(self._repos.values(), key=lambda r: (not r.builtin, r.name))
