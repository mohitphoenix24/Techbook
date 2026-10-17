from .conftest import AGENT, LEAD, process


def post(client, path, headers=AGENT, **json):
    return client.post(path, headers=headers, json=json or None)


# region: auth-tests
def test_every_desk_endpoint_needs_a_valid_token(client):
    for method, path in [("get", "/api/tickets"), ("get", "/api/tickets/1"), ("post", "/api/tickets/1/process"), ("post", "/api/tickets/1/approve"), ("get", "/api/me"), ("get", "/api/metrics")]:
        assert getattr(client, method)(path).status_code == 401, path
    assert client.get("/api/me", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/api/me", headers=AGENT).json() == {"name": "Asha (agent)", "role": "agent"}
    assert client.get("/api/health").json()["provider"] == "mock"                     # the only open endpoints: health and the intake form


def test_metrics_are_for_team_leads_only(client):
    assert client.get("/api/metrics", headers=AGENT).status_code == 403
    assert client.get("/api/metrics", headers=LEAD).status_code == 200
# endregion: auth-tests


# region: workflow-api-tests
def test_the_whole_approval_flow_with_its_audit_trail(client):
    process(client, 1)
    assert post(client, "/api/tickets/1/send").status_code == 409                       # not approved yet
    approved = post(client, "/api/tickets/1/approve")
    assert approved.status_code == 200 and approved.json()["status"] == "approved"
    sent = post(client, "/api/tickets/1/send", LEAD).json()
    assert sent["status"] == "sent" and sent["actions"] == [] and sent["messages"][0]["text"] == sent["draft"]["text"]
    assert [(a["actor"], a["action"]) for a in sent["audit"]] == [("Asha (agent)", "process"), ("Asha (agent)", "approve"), ("Ravi (team lead)", "send")]


def test_a_lead_approves_a_large_refund_and_it_is_attributed_to_them(client):
    process(client, 12)                                                                  # the Rs 24,999 television
    assert post(client, "/api/tickets/12/approve").status_code == 403
    assert post(client, "/api/tickets/12/approve", LEAD).json()["status"] == "approved"
    assert client.get("/api/tickets/12", headers=LEAD).json()["audit"][-1]["actor"] == "Ravi (team lead)"


def test_rejecting_records_the_reason_and_lets_the_copilot_try_again(client):
    process(client, 2)
    rejected = post(client, "/api/tickets/2/reject", reason="Too formal for this customer")
    assert rejected.json()["status"] == "rejected" and rejected.json()["audit"][-1]["detail"] == "Too formal for this customer"
    process(client, 2)
    assert client.get("/api/tickets/2", headers=AGENT).json()["draft"]["version"] == 2


def test_editing_reruns_the_checks_on_the_human_text_too(client):
    process(client, 1)
    bad = post(client, "/api/tickets/1/draft", text="Hi Asha, order AUR-1001 is fine. Call me on 98765 43210 [kb:returns] for ₹4,499.")
    assert bad.status_code == 200 and "approve" not in bad.json()["actions"]
    assert {c["name"] for c in bad.json()["draft"]["checks"] if not c["ok"]} == {"no_personal_data"}


def test_a_message_is_not_sent_if_personal_data_is_found_at_the_last_moment(client, settings):
    from app.store import Store
    process(client, 1)
    post(client, "/api/tickets/1/approve")
    store = Store(settings.database_path)
    draft = store.latest_draft(1)
    store.add_draft(1, draft["text"] + " Call 98765 43210.", draft["policy"], [], [], draft["sources"], "human", "someone")      # a check was skipped
    sent = post(client, "/api/tickets/1/send")
    assert sent.status_code == 409 and sent.json()["detail"]["code"] == "personal_data"


def test_a_ticket_cannot_be_processed_twice_at_once_or_in_the_wrong_state(client):
    client.app.state.processing.add(4)
    assert post(client, "/api/tickets/4/process").json()["detail"]["code"] == "busy"
    client.app.state.processing.discard(4)
    process(client, 4), post(client, "/api/tickets/4/approve"), post(client, "/api/tickets/4/send")
    assert post(client, "/api/tickets/4/process").json()["detail"]["code"] == "invalid_state"       # already sent
    assert post(client, "/api/tickets/999/process").status_code == 404
# endregion: workflow-api-tests


# region: intake-tests
def test_the_public_form_creates_a_ticket_and_echoes_nothing_private(client):
    created = client.post("/api/intake", json={"from_email": "new.customer@example.com", "subject": "Where is my parcel", "body": "Order AUR-1003 has not arrived yet, please check."})
    assert created.status_code == 201 and set(created.json()) == {"id", "message"}
    found = client.get(f"/api/tickets/{created.json()['id']}", headers=AGENT).json()
    assert found["status"] == "new" and found["subject"] == "Where is my parcel"


def test_the_public_form_validates_strictly_and_is_rate_limited(client):
    assert client.post("/api/intake", json={"from_email": "not-an-email", "subject": "Hello there", "body": "A body that is long enough."}).status_code == 422
    assert client.post("/api/intake", json={"from_email": "a@b.co", "subject": "Hello there", "body": "x" * 5000}).status_code == 422
    ok = {"from_email": "a@b.co", "subject": "Hello there", "body": "A body that is long enough."}
    codes = [client.post("/api/intake", json=ok).status_code for _ in range(7)]
    assert codes[:5] == [201] * 5 and codes[5] == 429                                    # intake_per_minute=5 in the test settings


def test_inbox_lists_urgent_tickets_first_after_they_are_triaged(client):
    process(client, 1), process(client, 7)
    inbox = client.get("/api/tickets", headers=AGENT).json()
    assert inbox[0]["id"] == 7 and inbox[0]["priority"] == "urgent"
    assert [t["id"] for t in client.get("/api/tickets?status=escalated", headers=AGENT).json()] == [7]
    assert [t["id"] for t in client.get("/api/tickets?q=headphones", headers=AGENT).json()] == [1]
# endregion: intake-tests


def test_metrics_show_the_queue_and_what_the_gateway_has_done(client):
    process(client, 1), process(client, 1)
    post(client, "/api/tickets/1/approve")
    m = client.get("/api/metrics", headers=LEAD).json()
    assert m["tickets"] == 18 and m["by_status"]["approved"] == 1 and m["processed_runs"] == 2 and m["approved"] == 1
    assert m["gateway"]["cache_hits"] >= 1 and m["gateway"]["breakers"] == {"mock": "closed"}              # the second triage came from the cache
