from fastapi import HTTPException, Request

from .config import Settings
from .llm import LLMClient
from .repos import Repo, RepoStore


def get_llm(request: Request) -> LLMClient:
    return request.app.state.llm


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


def get_store(request: Request) -> RepoStore:
    return request.app.state.repos


def get_repo(repo_id: str, request: Request) -> Repo:
    repo = request.app.state.repos.get(repo_id)
    if repo is None:
        raise HTTPException(404, detail={"code": "not_found", "message": "There is no such repository."})
    return repo
