from fastapi import APIRouter, Depends, Request

from ..auth import Principal, current_user, require_lead
from ..deps import get_store
from ..store import Store

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health")
def health(request: Request) -> dict:
    gateway = request.app.state.gateway
    return {"status": "ok", "provider": gateway.providers[0].name, "model": gateway.model}


@router.get("/me")
def me(user: Principal = Depends(current_user)) -> dict:
    return {"name": user.name, "role": user.role}


# region: metrics
@router.get("/metrics")
def metrics(request: Request, user: Principal = Depends(require_lead), store: Store = Depends(get_store)) -> dict:
    """Numbers for the team lead: the queue, how the copilot is doing, and what the gateway has been protecting."""
    gateway = request.app.state.gateway
    return {**store.metrics(), "gateway": {**gateway.stats, "breakers": {p.name: gateway.breakers[id(p)].state for p in gateway.providers},
                                           "spent_today_usd": {u: round(v, 6) for (_, u), v in gateway.budget.spent.items()}}}
# endregion: metrics
