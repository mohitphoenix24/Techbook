import pytest

from app.workflow import Gate, WorkflowError, allowed_actions, next_status, status_after_processing


# region: workflow-tests
def test_where_a_ticket_goes_after_the_copilot_has_finished():
    assert status_after_processing(needs_human=False, needs_lead=False) == "drafted"
    assert status_after_processing(needs_human=False, needs_lead=True) == "needs_lead"
    assert status_after_processing(needs_human=True, needs_lead=True) == "escalated"


def test_the_happy_path_needs_a_human_to_approve_before_anything_is_sent():
    assert "send" not in allowed_actions("drafted", "agent")
    status = next_status("drafted", "approve", "agent")
    assert status == "approved" and next_status(status, "send", "agent") == "sent"


def test_a_large_refund_needs_a_team_lead():
    gate = Gate(needs_lead=True)
    assert "approve" not in allowed_actions("needs_lead", "agent", gate) and "approve" in allowed_actions("needs_lead", "lead", gate)
    with pytest.raises(WorkflowError) as err:
        next_status("needs_lead", "approve", "agent", gate)
    assert err.value.code == "lead_required" and err.value.status_code == 403
    assert next_status("needs_lead", "approve", "lead", gate) == "approved"


def test_a_failing_guardrail_check_blocks_approval_for_everyone():
    gate = Gate(blocked=True)
    for role in ("agent", "lead"):
        assert "approve" not in allowed_actions("drafted", role, gate)
    with pytest.raises(WorkflowError) as err:
        next_status("drafted", "approve", "lead", gate)
    assert err.value.code == "blocked_by_checks"


def test_nothing_can_be_sent_before_it_is_approved_or_twice():
    for status in ("new", "drafted", "needs_lead", "rejected", "escalated", "sent"):
        with pytest.raises(WorkflowError):
            next_status(status, "send", "lead")


def test_rejecting_sends_a_ticket_back_for_another_try():
    status = next_status("drafted", "reject", "agent")
    assert status == "rejected" and "process" in allowed_actions(status, "agent")


def test_only_a_lead_can_close_an_escalated_ticket_and_an_unknown_role_can_do_nothing():
    assert allowed_actions("escalated", "agent") == [] and allowed_actions("escalated", "lead") == ["close"]
    assert allowed_actions("drafted", "intern") == []
# endregion: workflow-tests
