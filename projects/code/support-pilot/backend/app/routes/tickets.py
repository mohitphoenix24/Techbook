import re
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..auth import Principal, current_user
from ..checks import Check, blocking_failures, run_checks
from ..deps import get_pipeline_deps, get_settings_dep, get_store
from ..config import Settings
from ..pipeline import Deps, find_order, process_ticket
from ..policy import Decision
from ..redact import find_personal_data
from ..schemas import DraftEdit, IntakeRequest, ProcessRequest, RejectRequest
from ..sse import SSE_HEADERS, sse
from ..store import Store
from ..workflow import Gate, WorkflowError, allowed_actions, next_status

router = APIRouter(prefix="/api", tags=["tickets"])


def fail(code: str, message: str, status: int) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message})


def workflow_error(exc: WorkflowError) -> HTTPException:
    return fail(exc.code, exc.message, exc.status_code)


# region: view
def gate_of(draft: dict | None) -> Gate:
    if draft is None:
        return Gate()
    return Gate(needs_lead=bool(draft["policy"].get("needs_lead")), blocked=any(not c["ok"] and c["severity"] == "block" for c in draft["checks"]))


def view(store: Store, ticket: dict, role: str) -> dict:
    """A ticket as the desk needs it. `actions` is the list of buttons this person may press: the browser draws exactly these."""
    draft = store.latest_draft(ticket["id"])
    return {**ticket, "draft": draft, "actions": allowed_actions(ticket["status"], role, gate_of(draft)), "audit": store.audit(ticket["id"]),
            "messages": store.messages(ticket["id"]), "has_trace": store.latest_trace(ticket["id"]) is not None}


def load(store: Store, ticket_id: int) -> dict:
    ticket = store.get_ticket(ticket_id)
    if ticket is None:
        raise fail("not_found", "There is no such ticket.", 404)
    return ticket
# endregion: view


# region: intake
@router.post("/intake", status_code=201)
def intake(body: IntakeRequest, request: Request, settings: Settings = Depends(get_settings_dep), store: Store = Depends(get_store)) -> dict:
    """The public form. No sign-in, so it is strictly validated, rate limited per address, and echoes nothing back."""
    wait = request.app.state.intake_limiter.check(request.client.host if request.client else "unknown")
    if wait:
        raise HTTPException(429, detail={"code": "rate_limited", "message": f"Too many requests. Try again in {wait:g} seconds."}, headers={"Retry-After": str(int(wait) + 1)})
    return {"id": store.add_ticket(body.from_email, body.subject.strip(), body.body.strip(), body.channel), "message": "Thank you. We will reply by email."}
# endregion: intake


@router.get("/tickets")
def list_tickets(status: str | None = None, q: str | None = None, user: Principal = Depends(current_user), store: Store = Depends(get_store)) -> list[dict]:
    rows = store.list_tickets(status, q)
    return [{"id": t["id"], "subject": t["subject"], "from_email": t["from_email"], "status": t["status"], "created_at": t["created_at"], "channel": t["channel"],
             "category": (t["triage"] or {}).get("category"), "priority": (t["triage"] or {}).get("priority"), "sentiment": (t["triage"] or {}).get("sentiment"),
             "summary": (t["triage"] or {}).get("summary")} for t in rows]


@router.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: int, user: Principal = Depends(current_user), store: Store = Depends(get_store)) -> dict:
    return view(store, load(store, ticket_id), user.role)


# region: process-route
@router.post("/tickets/{ticket_id}/process")
async def process(ticket_id: int, request: Request, body: ProcessRequest | None = None, user: Principal = Depends(current_user),
                  deps: Deps = Depends(get_pipeline_deps)) -> StreamingResponse:
    """Run the copilot on a ticket and stream its progress. A ticket can be processed by one request at a time."""
    ticket = load(deps.store, ticket_id)
    if "process" not in allowed_actions(ticket["status"], user.role, gate_of(deps.store.latest_draft(ticket_id))):
        raise fail("invalid_state", f"You cannot process a ticket that is {ticket['status']}.", 409)
    busy: set[int] = request.app.state.processing
    if ticket_id in busy:
        raise fail("busy", "The copilot is already working on this ticket.", 409)
    busy.add(ticket_id)
    simulate = body.simulate if body else "none"

    async def events() -> AsyncIterator[str]:
        try:
            async for event in process_ticket(ticket, deps, user, simulate):
                yield sse(event.pop("type"), event)
        finally:
            busy.discard(ticket_id)

    return StreamingResponse(events(), media_type="text/event-stream", headers=SSE_HEADERS)
# endregion: process-route


# region: edit
@router.post("/tickets/{ticket_id}/draft")
def edit_draft(ticket_id: int, body: DraftEdit, user: Principal = Depends(current_user), store: Store = Depends(get_store)) -> dict:
    """A human edits the draft. The same guardrail checks run again on the new text, so a person cannot slip a bad reply past them either."""
    ticket = load(store, ticket_id)
    draft = store.latest_draft(ticket_id)
    try:
        next_status(ticket["status"], "edit", user.role, gate_of(draft))
    except WorkflowError as exc:
        raise workflow_error(exc)
    assert draft is not None and ticket["triage"] is not None
    decision = Decision(**draft["policy"])
    order, _ = find_order(store, ticket, ticket["triage"]["order_ids"])
    checks = run_checks(body.text.strip(), decision=decision, sentiment=ticket["triage"]["sentiment"], order=order, article_ids=set(draft["sources"]))
    citations = list(dict.fromkeys(re.findall(r"\[kb:([a-z0-9-]+)\]", body.text)))
    store.add_draft(ticket_id, body.text.strip(), draft["policy"], [c.__dict__ for c in checks], citations, draft["sources"], "human", user.name)
    store.add_audit(ticket_id, user.name, user.role, "edit", f"edited; {len(blocking_failures(checks))} blocking problem(s) remain")
    return view(store, ticket, user.role)
# endregion: edit


# region: decide
def _transition(ticket_id: int, action: str, user: Principal, store: Store, detail: str = "") -> dict:
    ticket = load(store, ticket_id)
    draft = store.latest_draft(ticket_id)
    try:
        new = next_status(ticket["status"], action, user.role, gate_of(draft))
    except WorkflowError as exc:
        raise workflow_error(exc)
    if action == "send":
        assert draft is not None
        if find_personal_data(draft["text"]):                  # the last look before it leaves the building
            raise fail("personal_data", "The reply contains personal data. Edit it first.", 409)
        store.add_message(ticket_id, draft["text"], user.name)
    store.update_ticket(ticket_id, status=new)
    store.add_audit(ticket_id, user.name, user.role, action, detail)
    return view(store, load(store, ticket_id), user.role)


@router.post("/tickets/{ticket_id}/approve")
def approve(ticket_id: int, user: Principal = Depends(current_user), store: Store = Depends(get_store)) -> dict:
    return _transition(ticket_id, "approve", user, store)


@router.post("/tickets/{ticket_id}/reject")
def reject(ticket_id: int, body: RejectRequest, user: Principal = Depends(current_user), store: Store = Depends(get_store)) -> dict:
    return _transition(ticket_id, "reject", user, store, body.reason)


@router.post("/tickets/{ticket_id}/send")
def send(ticket_id: int, user: Principal = Depends(current_user), store: Store = Depends(get_store)) -> dict:
    return _transition(ticket_id, "send", user, store)


@router.post("/tickets/{ticket_id}/close")
def close(ticket_id: int, user: Principal = Depends(current_user), store: Store = Depends(get_store)) -> dict:
    return _transition(ticket_id, "close", user, store)
# endregion: decide


@router.get("/tickets/{ticket_id}/trace")
def trace(ticket_id: int, user: Principal = Depends(current_user), store: Store = Depends(get_store)) -> dict:
    load(store, ticket_id)
    found = store.latest_trace(ticket_id)
    if found is None:
        raise fail("no_trace", "This ticket has not been processed yet.", 404)
    return found
