import io

from .helpers import make_pdf
from app.doctypes.samples import SAMPLES

INVOICE = SAMPLES["invoice"][0]["text"]


def test_doc_types_describe_fields_and_include_samples(client):
    types = {t["id"]: t for t in client.get("/api/doc-types").json()}
    assert set(types) == {"invoice", "meeting_notes", "support_ticket"}
    assert [f["name"] for f in types["invoice"]["fields"]][:3] == ["vendor", "invoice_number", "invoice_date"]
    assert len(types["invoice"]["samples"]) == 2 and types["support_ticket"]["samples"][0]["text"].startswith("From:")


def test_health_reports_the_provider(client):
    assert client.get("/api/health").json() == {"status": "ok", "provider": "mock", "model": "mock-1"}


def test_every_sample_extracts_cleanly(client):
    for doc_type, samples in SAMPLES.items():
        for sample in samples:
            r = client.post("/api/extract", json={"doc_type": doc_type, "text": sample["text"]})
            body = r.json()
            assert r.status_code == 200 and body["valid"] and body["issues"] == [], (doc_type, sample["id"])


def test_response_has_everything_the_interface_needs(client):
    body = client.post("/api/extract", json={"doc_type": "invoice", "text": INVOICE}).json()
    assert body["data"]["invoice_number"] == "INV-2026-0042" and body["attempts"] == 1
    assert body["grounding"]["total"]["status"] == "found"
    span = body["grounding"]["invoice_number"]
    assert INVOICE[span["start"]:span["end"]] == "INV-2026-0042"                     # offsets point at the evidence
    assert body["usage"]["cost_usd"] > 0 and body["provider"] == "mock" and body["duration_ms"] >= 0


def test_simulated_mistakes_through_the_api(client):
    repaired = client.post("/api/extract", json={"doc_type": "invoice", "text": INVOICE, "simulate_mistake": "rule"}).json()
    assert repaired["valid"] and repaired["attempts"] == 2
    invented = client.post("/api/extract", json={"doc_type": "invoice", "text": INVOICE, "simulate_mistake": "invent"}).json()
    assert invented["valid"] and invented["issues"][0]["path"] == "invoice_number"


def test_bad_requests_are_normal_http_errors(client):
    assert client.post("/api/extract", json={"doc_type": "passport", "text": "x"}).status_code == 404
    assert client.post("/api/extract", json={"doc_type": "invoice", "text": ""}).status_code == 422
    assert client.post("/api/extract", json={"doc_type": "invoice", "text": "x", "simulate_mistake": "bogus"}).status_code == 422
    assert client.post("/api/extract", json={"doc_type": "invoice", "text": "x" * 40_000}).status_code == 413


def test_a_document_the_extractor_cannot_read_comes_back_invalid_not_as_a_crash(client):
    body = client.post("/api/extract", json={"doc_type": "invoice", "text": "Hello, this is not an invoice at all."}).json()
    assert body["valid"] is False and body["attempts"] == 3
    assert any(i["level"] == "error" for i in body["issues"])


# region: review-tests
def test_a_person_can_correct_the_result_and_the_correction_is_stored(client):
    result = client.post("/api/extract", json={"doc_type": "invoice", "text": INVOICE}).json()
    fixed = {**result["data"], "vendor": "Sharma Stationers"}
    assert client.post(f"/api/extractions/{result['id']}/review", json={"data": fixed}).json()["ok"]
    saved = client.get(f"/api/extractions/{result['id']}").json()
    assert saved["reviewed"]["vendor"] == "Sharma Stationers" and saved["result"]["data"]["vendor"] == "Sharma Stationers Pvt Ltd"


def test_corrections_must_still_pass_the_schema(client):
    result = client.post("/api/extract", json={"doc_type": "invoice", "text": INVOICE}).json()
    r = client.post(f"/api/extractions/{result['id']}/review", json={"data": {**result["data"], "total": 1}})
    assert r.status_code == 422 and "subtotal + tax" in r.json()["detail"][0]["message"]
# endregion: review-tests


def test_history_list_get_delete(client):
    a = client.post("/api/extract", json={"doc_type": "invoice", "text": INVOICE}).json()
    b = client.post("/api/extract", json={"doc_type": "support_ticket", "text": SAMPLES["support_ticket"][0]["text"]}).json()
    listing = client.get("/api/extractions").json()
    assert [x["id"] for x in listing] == [b["id"], a["id"]] and listing[0]["valid"] and not listing[0]["reviewed"]
    assert client.delete(f"/api/extractions/{a['id']}").status_code == 204
    assert client.get(f"/api/extractions/{a['id']}").status_code == 404
    assert len(client.get("/api/extractions").json()) == 1


# region: upload-tests
def test_text_files_and_pdfs_become_text(client):
    r = client.post("/api/documents/text", files={"file": ("a.txt", io.BytesIO("नमस्ते Invoice".encode()), "text/plain")})
    assert r.json()["text"] == "नमस्ते Invoice"

    pdf = make_pdf(["Invoice No: INV-1", "Total: 100.00"])
    r = client.post("/api/documents/text", files={"file": ("a.pdf", io.BytesIO(pdf), "application/pdf")})
    body = r.json()
    assert r.status_code == 200 and body["kind"] == "pdf" and body["pages"] == 1
    assert "Invoice No: INV-1" in body["text"] and "Total: 100.00" in body["text"]


def test_unsupported_and_unreadable_uploads_get_clear_errors(client):
    assert client.post("/api/documents/text", files={"file": ("a.exe", io.BytesIO(b"MZ"), "application/octet-stream")}).status_code == 415
    r = client.post("/api/documents/text", files={"file": ("broken.pdf", io.BytesIO(b"not a pdf"), "application/pdf")})
    assert r.status_code == 415 and "could not be read" in r.json()["detail"]
    blank = make_pdf([])
    r = client.post("/api/documents/text", files={"file": ("scan.pdf", io.BytesIO(blank), "application/pdf")})
    assert r.status_code == 415 and "no text layer" in r.json()["detail"]
# endregion: upload-tests


# region: export-test
def test_reviewed_extractions_can_be_exported_as_eval_cases(client):
    import json

    assert client.get("/api/export/eval-cases").text == ""                                  # nothing reviewed yet
    result = client.post("/api/extract", json={"doc_type": "invoice", "text": INVOICE}).json()
    client.post("/api/extract", json={"doc_type": "invoice", "text": INVOICE})             # never reviewed: not exported
    client.post(f"/api/extractions/{result['id']}/review", json={"data": {**result["data"], "vendor": "Sharma Stationers"}})

    response = client.get("/api/export/eval-cases")
    cases = [json.loads(line) for line in response.text.splitlines()]
    assert "attachment" in response.headers["content-disposition"] and len(cases) == 1
    assert cases[0]["text"] == INVOICE and cases[0]["expected"]["vendor"] == "Sharma Stationers" and cases[0]["doc_type"] == "invoice"
# endregion: export-test
