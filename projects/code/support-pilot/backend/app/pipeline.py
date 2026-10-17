"""The copilot pipeline: from a customer's ticket to a checked draft that waits for a human.

    redact -> triage -> (escalate?) -> lookup -> decide -> retrieve -> draft -> check (and revise once)

Each stage is a traced span and yields events, so the browser can show progress. The pipeline only ever DRAFTS: it never
sends anything, and it cannot grant a refund. Money is decided by policy.py, and a person approves the result.
"""
import re
from collections.abc import AsyncIterator
from dataclasses import asdict, dataclass
from datetime import date
from typing import Any

from .kb import ARTICLE_BY_ID, INDEX
from .checks import blocking_failures, run_checks
from .config import Settings
from .gateway import Clock
from .llm.base import LLMClient, LLMError, TextDelta, TextDone
from .policy import decide
from .principal import Principal
from .pricing import cost_usd
from .prompts import DRAFT_SYSTEM, facts_text, revision_message
from .redact import redact
from .store import Store
from .tracing import Tracer
from .triage import classify
from .workflow import status_after_processing


@dataclass
class Deps:
    store: Store
    llm: LLMClient              # already bound to the signed-in user, so rate limits and budgets are per person
    settings: "Settings"
    clock: Clock


def first_name_of(email: str) -> str:
    return re.split(r"[._\-+0-9]", email.split("@")[0])[0].capitalize() or "there"


def _stage(name: str, status: str, **data: Any) -> dict:
    return {"type": "stage", "name": name, "status": status, **data}


# region: lookup
def find_order(store: Store, ticket: dict, order_ids: list[str]) -> tuple[dict | None, str]:
    """The customer's order, or None. Returns (order, how) where `how` explains the outcome for the trace.

    An order number is only honoured when it belongs to the email the ticket came from: anyone can TYPE someone else's number.
    """
    mismatch = False
    for oid in order_ids:
        order = store.get_order(oid)
        if order is None:
            continue
        if order["email"].lower() == ticket["from_email"].lower():
            return order, "named"
        mismatch = True
    if mismatch:
        return None, "belongs_to_someone_else"
    own = store.orders_for_email(ticket["from_email"])
    if not order_ids and len(own) == 1:
        return own[0], "only_order"
    return None, "not_found"
# endregion: lookup


# region: process
async def process_ticket(ticket: dict, deps: Deps, user: Principal, simulate: str = "none") -> AsyncIterator[dict]:
    """Run the pipeline for one ticket and yield events. Nothing is sent to the customer."""
    store, llm, settings = deps.store, deps.llm, deps.settings
    tracer = Tracer(deps.clock)
    flaky = {"left": 2} if simulate == "flaky" else None
    hints: dict[str, Any] = {"simulate": simulate, **({"flaky": flaky} if flaky else {})}
    ticket_id = ticket["id"]
    status = ticket["status"]
    try:
        with tracer.span("ticket", id=ticket_id, channel=ticket["channel"]):
            # 1. hide personal data BEFORE anything else sees the text
            yield _stage("redact", "start")
            with tracer.span("redact") as sp:
                original = f"Subject: {ticket['subject']}\n\n{ticket['body']}"
                red = redact(original)
                sp.set(redactions=red.counts())
            yield _stage("redact", "done", ms=sp.duration_ms, summary=f"{len(red.items)} personal detail(s) hidden" if red.items else "nothing to hide", counts=red.counts())

            # 2. triage with structured output
            yield _stage("triage", "start")
            with tracer.span("triage", model=llm.model) as sp:
                triage, info = await classify(llm, red.text, original, {**hints, "task": "triage"})
                sp.set(input_tokens=info.usage.input_tokens, output_tokens=info.usage.output_tokens, cost_usd=cost_usd(info.model or llm.model, info.usage.input_tokens, info.usage.output_tokens),
                       cached=info.cached, attempts=info.attempts, repaired=info.repaired, fell_back=info.fell_back, model=info.model, category=triage.category, priority=triage.priority)
            note = " (answered from the cache)" if info.cached else f" (took {info.attempts} tries)" if info.attempts > 1 else ""
            yield _stage("triage", "done", ms=sp.duration_ms, summary=f"{triage.category}, {triage.priority} priority, {triage.sentiment}{note}", triage=triage.model_dump())

            if triage.needs_human:
                # a person must read this one: stop here and do not draft
                store.update_ticket(ticket_id, status="escalated", triage=triage.model_dump(), redactions=red.counts())
                store.add_audit(ticket_id, user.name, user.role, "process", "escalated to a person: the copilot did not draft")
                yield _stage("escalate", "done", summary="This needs a person. The copilot did not draft a reply.")
                status = "escalated"
            else:
                # 3. find the customer's order
                yield _stage("lookup", "start")
                with tracer.span("lookup") as sp:
                    order, how = find_order(store, ticket, triage.order_ids)
                    sp.set(order=order["id"] if order else None, how=how)
                summary = f"order {order['id']} ({order['status']})" if order else {"belongs_to_someone_else": "that order belongs to another customer, so no details are used", "not_found": "no order found"}[how]
                yield _stage("lookup", "done", ms=sp.duration_ms, summary=summary, how=how)

                # 4. the policy decides: code, not the model
                with tracer.span("decide") as sp:
                    decision = decide(triage.category, order, date.fromisoformat(settings.today), settings.refund_auto_limit_inr)
                    sp.set(**asdict(decision))
                yield _stage("decide", "done", ms=sp.duration_ms, summary=f"{decision.action}: {decision.reason}", decision=asdict(decision))

                # region: retrieve-stage
                # 5. the rule's own article first, then whatever search adds
                with tracer.span("retrieve") as sp:
                    query = f"{ticket['subject']} {triage.summary} {triage.category}"
                    found = [a.id for a, _ in INDEX.search(query, k=3)]
                    must = ([decision.article] if decision.article else [])                                     # the rule's own article, always
                    must += ["refunds-timeline"] if decision.action in ("refund", "cancel") and decision.amount else []   # a customer always asks "when?"
                    must += ["damaged"] if decision.code == "window_closed" else []                             # the way out for a faulty item
                    articles = [ARTICLE_BY_ID[i] for i in list(dict.fromkeys(must + found))[:3]]
                    sp.set(articles=[a.id for a in articles])
                yield _stage("retrieve", "done", ms=sp.duration_ms, summary=", ".join(a.id for a in articles) or "no article", articles=[a.id for a in articles])
                # endregion: retrieve-stage

                # region: draft-stage
                # 6. draft, check, and revise ONCE if a blocking check fails
                facts = {"first_name": first_name_of(ticket["from_email"]), "sentiment": triage.sentiment, "language": triage.language, "order": order, "decision": asdict(decision),
                         "articles": [a.id for a in articles]}
                prompt = facts_text(ticket_text=red.text, first_name=facts["first_name"], sentiment=triage.sentiment, language=triage.language, order=order, decision=decision, articles=articles)
                messages = [{"role": "user", "content": prompt}]
                provided = {a.id for a in articles}
                draft_text, checks = "", []
                for attempt in range(2):
                    yield _stage("draft" if attempt == 0 else "revise", "start")
                    if attempt:
                        yield {"type": "reset"}
                    with tracer.span("draft" if attempt == 0 else "revise", model=llm.model) as sp:
                        done: TextDone | None = None
                        async for event in llm.stream_text(system=DRAFT_SYSTEM, messages=messages, max_tokens=settings.max_output_tokens,
                                                           hints={**hints, "task": "draft", "facts": facts, "revision": attempt > 0}):
                            if isinstance(event, TextDelta):
                                yield {"type": "delta", "text": event.text}
                            else:
                                done = event
                        assert done is not None
                        draft_text = done.text.strip()
                        sp.set(input_tokens=done.usage.input_tokens, output_tokens=done.usage.output_tokens, attempts=done.attempts, model=done.model,
                               cost_usd=cost_usd(done.model or llm.model, done.usage.input_tokens, done.usage.output_tokens))
                    with tracer.span("check") as cs:
                        checks = run_checks(draft_text, decision=decision, sentiment=triage.sentiment, order=order, article_ids=provided)
                        failing = blocking_failures(checks)
                        cs.set(failed=[c.name for c in failing])
                    yield _stage("draft" if attempt == 0 else "revise", "done", ms=sp.duration_ms, summary=f"{len(draft_text.split())} words")
                    if not failing or attempt:
                        break
                    messages = [*messages, {"role": "assistant", "content": draft_text}, {"role": "user", "content": revision_message([c.detail for c in failing])}]
                yield _stage("check", "done", ms=cs.duration_ms, summary="all checks passed" if not blocking_failures(checks) else f"{len(blocking_failures(checks))} blocking problem(s): a person must edit the draft",
                             checks=[asdict(c) for c in checks])
                # endregion: draft-stage

                # 7. save: a draft waits for a human, never goes out by itself
                citations = [c for c in dict.fromkeys(re.findall(r"\[kb:([a-z0-9-]+)\]", draft_text))]
                draft = store.add_draft(ticket_id, draft_text, asdict(decision), [asdict(c) for c in checks], citations, sorted(provided), "model", "copilot")
                status = status_after_processing(needs_human=False, needs_lead=decision.needs_lead)
                store.update_ticket(ticket_id, status=status, triage=triage.model_dump(), redactions=red.counts())
                store.add_audit(ticket_id, user.name, user.role, "process", f"drafted v{draft['version']}: {decision.action} {decision.code}")
                yield {"type": "draft", "draft": draft}
    except LLMError as exc:
        store.add_audit(ticket_id, user.name, user.role, "process_failed", f"{exc.code}")
        store.add_trace(ticket_id, tracer.summary(), tracer.to_list())
        yield {"type": "error", "code": exc.code, "message": exc.message, "retryable": exc.retryable}
        return

    summary = tracer.summary()
    store.add_trace(ticket_id, summary, tracer.to_list())
    yield {"type": "done", "status": status, "trace": summary}
# endregion: process
