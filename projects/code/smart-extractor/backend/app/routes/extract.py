import time

import json

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile

from ..config import Settings
from ..db import Store
from ..deps import get_app_settings, get_llm, get_store
from ..describe import describe
from ..doctypes import DOC_TYPES
from ..doctypes.samples import SAMPLES
from ..extract import extract_document, format_errors
from ..files import UnsupportedFile, text_from_upload
from ..llm import LLMClient, LLMError
from ..pricing import cost_usd
from ..schemas import ExtractionResult, ExtractRequest, ReviewRequest

router = APIRouter(prefix="/api", tags=["extract"])


@router.get("/health")
def health(llm: LLMClient = Depends(get_llm)) -> dict:
    return {"status": "ok", "provider": llm.name, "model": llm.model}


# region: doc-types
@router.get("/doc-types")
def doc_types() -> list[dict]:
    """Everything the front end needs to draw itself: the types, their fields, and sample documents."""
    return [{"id": d.id, "name": d.name, "description": d.description, "fields": describe(d.model), "samples": SAMPLES.get(d.id, [])}
            for d in DOC_TYPES.values()]
# endregion: doc-types


# region: extract-route
@router.post("/extract", response_model=ExtractionResult)
async def extract(
    body: ExtractRequest,
    llm: LLMClient = Depends(get_llm),
    store: Store = Depends(get_store),
    settings: Settings = Depends(get_app_settings),
):
    doc = DOC_TYPES.get(body.doc_type)
    if doc is None:
        raise HTTPException(404, f"Unknown document type '{body.doc_type}'.")
    if len(body.text) > settings.max_document_chars:
        raise HTTPException(413, f"The document is too long ({len(body.text):,} characters; the limit is {settings.max_document_chars:,}).")

    started = time.perf_counter()
    try:
        result = await extract_document(
            llm, doc, body.text, max_repairs=settings.max_repairs, max_tokens=settings.max_output_tokens,
            hints={"simulate_mistake": body.simulate_mistake} if body.simulate_mistake != "none" else None,
        )
    except LLMError as exc:
        status = {"auth": 502, "rate_limited": 429, "refused": 422}.get(exc.code, 502)
        raise HTTPException(status, exc.message) from exc

    payload = {
        "doc_type": doc.id, "data": result.data, "valid": result.valid, "attempts": result.attempts, "issues": result.issues,
        "grounding": result.grounding,
        "usage": {"input_tokens": result.usage.input_tokens, "output_tokens": result.usage.output_tokens,
                  "cost_usd": cost_usd(llm.model, result.usage.input_tokens, result.usage.output_tokens)},
        "provider": llm.name, "model": llm.model, "duration_ms": int((time.perf_counter() - started) * 1000),
    }
    payload["id"] = store.save(doc.id, body.text, payload)
    return payload
# endregion: extract-route


# region: review-route
@router.post("/extractions/{extraction_id}/review")
def review(extraction_id: str, body: ReviewRequest, store: Store = Depends(get_store)):
    """Save a person's corrections. They must still pass the schema: a human can make mistakes too."""
    record = store.get(extraction_id)
    if record is None:
        raise HTTPException(404, "Extraction not found.")
    from pydantic import ValidationError

    try:
        checked = DOC_TYPES[record["doc_type"]].model.model_validate(body.data)
    except ValidationError as exc:
        raise HTTPException(422, detail=format_errors(exc)) from exc
    store.review(extraction_id, checked.model_dump(mode="json"))
    return {"ok": True, "data": checked.model_dump(mode="json")}
# endregion: review-route


# region: export-route
@router.get("/export/eval-cases")
def export_eval_cases(store: Store = Depends(get_store)) -> Response:
    """Download every reviewed extraction as JSON Lines: one eval case per line, ready for `python -m evals.run --cases`."""
    lines = "\n".join(json.dumps(case, ensure_ascii=False) for case in store.reviewed_cases())
    return Response(lines + ("\n" if lines else ""), media_type="application/x-ndjson",
                    headers={"Content-Disposition": 'attachment; filename="eval-cases.jsonl"'})
# endregion: export-route


@router.get("/extractions")
def list_extractions(store: Store = Depends(get_store)):
    return [{"id": r["id"], "doc_type": r["doc_type"], "created_at": r["created_at"], "reviewed": r["reviewed"] is not None,
             "valid": r["result"]["valid"], "preview": " ".join(r["source_text"].split())[:80]} for r in store.recent()]


@router.get("/extractions/{extraction_id}")
def get_extraction(extraction_id: str, store: Store = Depends(get_store)):
    record = store.get(extraction_id)
    if record is None:
        raise HTTPException(404, "Extraction not found.")
    return record


@router.delete("/extractions/{extraction_id}", status_code=204)
def delete_extraction(extraction_id: str, store: Store = Depends(get_store)):
    if not store.delete(extraction_id):
        raise HTTPException(404, "Extraction not found.")


# region: upload-route
@router.post("/documents/text")
async def upload_text(file: UploadFile = File(...), settings: Settings = Depends(get_app_settings)):
    """Upload a file, get its text back. The user reads and fixes the text first; extraction is a separate step."""
    content = await file.read()
    if len(content) > 5_000_000:
        raise HTTPException(413, "The file is larger than 5 MB.")
    try:
        text, info = text_from_upload(file.filename or "", content)
    except UnsupportedFile as exc:
        raise HTTPException(415, str(exc)) from exc
    return {"text": text[: settings.max_document_chars], "truncated": len(text) > settings.max_document_chars, **info}
# endregion: upload-route
