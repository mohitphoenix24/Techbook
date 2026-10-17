"""Who is calling? Bearer tokens map to a person and a role. Roles decide what they may do (see workflow.py)."""
import hmac
from fastapi import Depends, HTTPException, Request

from .config import Settings
from .principal import Principal


# region: authenticate
def authenticate(token: str | None, settings: Settings) -> Principal | None:
    """Compare in constant time: a plain == leaks, through timing, how many leading characters were right."""
    if not token:
        return None
    for name, role, secret in (("Asha (agent)", "agent", settings.agent_token), ("Ravi (team lead)", "lead", settings.lead_token)):
        if secret and hmac.compare_digest(token.encode(), secret.encode()):
            return Principal(name, role)
    return None
# endregion: authenticate


# region: dependency
def current_user(request: Request) -> Principal:
    header = request.headers.get("authorization", "")
    token = header[7:] if header.lower().startswith("bearer ") else None
    user = authenticate(token, request.app.state.settings)
    if user is None:
        raise HTTPException(401, detail={"code": "unauthenticated", "message": "Sign in to use the desk."}, headers={"WWW-Authenticate": "Bearer"})
    return user


def require_lead(user: Principal = Depends(current_user)) -> Principal:
    if user.role != "lead":
        raise HTTPException(403, detail={"code": "lead_required", "message": "Only a team lead can see this."})
    return user
# endregion: dependency
