from fastapi import Depends, Request

from .auth import Principal, current_user
from .config import Settings
from .gateway import Clock, Gateway
from .pipeline import Deps
from .store import Store


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


def get_store(request: Request) -> Store:
    return request.app.state.store


def get_gateway(request: Request) -> Gateway:
    return request.app.state.gateway


def get_pipeline_deps(request: Request, user: Principal = Depends(current_user)) -> Deps:
    """Pipeline dependencies, with the model bound to THIS user so limits and budgets are per person."""
    s = request.app.state
    return Deps(s.store, s.gateway.bind(user.name), s.settings, s.clock)


def get_clock(request: Request) -> Clock:
    return request.app.state.clock
