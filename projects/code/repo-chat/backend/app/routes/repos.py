from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi import File as UploadedFile

from ..config import Settings
from ..deps import get_repo, get_settings_dep, get_store
from ..rag.ingest import Limits, RepoError, read_zip
from ..repos import Repo, RepoStore, build_repo
from ..rag.retrieve import retrieve
from .shared import hit_json

router = APIRouter(prefix="/api", tags=["repos"])


def fail(code: str, message: str, status: int) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message})


@router.get("/health")
def health(request_settings: Settings = Depends(get_settings_dep)) -> dict:
    return {"status": "ok", "provider": request_settings.resolved_provider, "model": request_settings.llm_model if request_settings.resolved_provider == "anthropic" else "mock-1"}


@router.get("/repos")
def list_repos(store: RepoStore = Depends(get_store)) -> list[dict]:
    return [r.summary() for r in store.list()]


# region: upload
@router.post("/repos", status_code=201)
async def upload(file: UploadFile = UploadedFile(...), settings: Settings = Depends(get_settings_dep), store: RepoStore = Depends(get_store)) -> dict:
    """Index an uploaded ZIP. It is read into memory with every limit enforced, and never extracted to disk."""
    if not (file.filename or "").lower().endswith(".zip"):
        raise fail("not_a_zip", "Upload a .zip file of the repository.", 400)
    limits = Limits(settings.max_zip_bytes, settings.max_files, settings.max_file_bytes, settings.max_total_bytes)
    data = await file.read(limits.max_zip_bytes + 1)                    # never read more than the limit, however big the upload
    try:
        result = read_zip(data, limits)
        name = (file.filename or "repo.zip")[:-4][:60]
        return store.add(build_repo(name, result.files, result.skipped, masked=result.masked)).summary()
    except RepoError as exc:
        raise fail("bad_repo", str(exc), 400)
# endregion: upload


@router.get("/repos/{repo_id}")
def get_one(repo: Repo = Depends(get_repo)) -> dict:
    return repo.summary()


@router.delete("/repos/{repo_id}", status_code=204)
def delete(repo_id: str, store: RepoStore = Depends(get_store)) -> None:
    if not store.remove(repo_id):
        raise fail("cannot_delete", "That repository does not exist or cannot be removed.", 404)


@router.get("/repos/{repo_id}/tree")
def tree(repo: Repo = Depends(get_repo)) -> list[dict]:
    chunks_per_file: dict[str, int] = {}
    for c in repo.chunks:
        chunks_per_file[c.path] = chunks_per_file.get(c.path, 0) + 1
    return [{"path": p, "lines": len(t.splitlines()), "chunks": chunks_per_file.get(p, 0)} for p, t in sorted(repo.files.items())]


# region: file
@router.get("/repos/{repo_id}/file")
def read_file(path: str, repo: Repo = Depends(get_repo)) -> dict:
    """One file's lines. The path is looked up in the in-memory dictionary, never on disk, so '../../etc/passwd' is simply 'not found'."""
    text = repo.files.get(path)
    if text is None:
        raise fail("not_found", "There is no such file in this repository.", 404)
    return {"path": path, "lines": text.splitlines()}
# endregion: file


@router.get("/repos/{repo_id}/search")
def search(q: str, k: int = 5, expand: bool = True, repo: Repo = Depends(get_repo)) -> dict:
    """The retrieval step on its own: what would be shown to the model for this question, and why."""
    result = retrieve(repo.index, repo.graph, q, k=max(1, min(k, 20)), expand=expand)
    return {"hits": [hit_json(h) for h in result.context]}
