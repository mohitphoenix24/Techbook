"""Who may do what to a ticket, and in which state: the approval workflow as a small, pure state machine.

The model drafts. A person approves. Nothing reaches a customer unless a human pressed Approve, and a refund above the
limit needs a team lead. These rules live here, in one place, and the interface only shows the buttons this module allows.
"""
from dataclasses import dataclass

# region: states
STATUSES = ("new", "drafted", "needs_lead", "approved", "sent", "rejected", "escalated", "closed")
ROLES = ("agent", "lead")


class WorkflowError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 409):
        super().__init__(message)
        self.code, self.message, self.status_code = code, message, status_code


@dataclass(frozen=True)
class Gate:
    """What the draft in front of the human looks like, for deciding what they may do."""
    needs_lead: bool = False          # the policy wants a team lead (a large refund)
    blocked: bool = False             # a blocking guardrail check is failing
# endregion: states


# region: transitions
def status_after_processing(*, needs_human: bool, needs_lead: bool) -> str:
    """Where a ticket goes when the copilot has finished with it."""
    return "escalated" if needs_human else "needs_lead" if needs_lead else "drafted"


def allowed_actions(status: str, role: str, gate: Gate = Gate()) -> list[str]:
    """The actions this person may take now. The API enforces it, and the browser draws exactly these buttons."""
    if role not in ROLES:
        return []
    actions: list[str] = []
    if status in ("new", "rejected", "drafted", "needs_lead"):
        actions.append("process")
    if status in ("drafted", "needs_lead"):
        actions += ["edit", "reject"]
        if not gate.blocked and (status == "drafted" or role == "lead"):
            actions.append("approve")
    if status == "approved":
        actions.append("send")
    if status in ("escalated", "rejected") and role == "lead":
        actions.append("close")
    return actions


def next_status(status: str, action: str, role: str, gate: Gate = Gate()) -> str:
    """The status after `action`, or a WorkflowError that says exactly why it is not allowed."""
    if action in allowed_actions(status, role, gate):
        return {"process": status, "edit": status, "reject": "rejected", "approve": "approved", "send": "sent", "close": "closed"}[action]
    if action == "approve" and status == "needs_lead" and role != "lead":
        raise WorkflowError("lead_required", "This refund is above the limit. A team lead must approve it.", 403)
    if action == "approve" and gate.blocked and status in ("drafted", "needs_lead"):
        raise WorkflowError("blocked_by_checks", "A guardrail check is failing. Edit the draft until it passes.")
    if action == "close" and role != "lead":
        raise WorkflowError("lead_required", "Only a team lead can close this ticket.", 403)
    raise WorkflowError("invalid_state", f"You cannot {action} a ticket that is {status}.")
# endregion: transitions
