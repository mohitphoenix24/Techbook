from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile

from ..config import Settings
from ..db import Store
from ..deps import get_app_settings, get_embedder, get_index, get_store
from ..ingest import UnsupportedFile, extract_pages, ingest_document, reindex_all, title_from
from ..rag.embeddings import Embedder
from ..rag.index import Index

router = APIRouter(prefix="/api", tags=["documents"])
SAMPLES = Path(__file__).resolve().parent.parent / "samples"


@router.get("/health")
def health(request: Request, store: Store = Depends(get_store)) -> dict:
    llm, embedder = request.app.state.llm, request.app.state.embedder
    return {"status": "ok", "provider": llm.name, "model": llm.model, "embedder": embedder.name,
            "stale_chunks": len(store.stale_chunks(embedder.name))}


@router.get("/documents")
def list_documents(store: Store = Depends(get_store)):
    return store.documents()


# region: upload
@router.post("/documents", status_code=202)
async def upload(
    background: BackgroundTasks,
    files: list[UploadFile] = File(...),
    store: Store = Depends(get_store),
    index: Index = Depends(get_index),
    embedder: Embedder = Depends(get_embedder),
    settings: Settings = Depends(get_app_settings),
):
    """Accept files and return at once. The slow work (chunking and embedding) continues in the background, and the
    browser polls GET /api/documents to watch each document go queued -> parsing -> embedding -> ready."""
    created = []
    for file in files:
        content = await file.read()
        if len(content) > settings.max_upload_bytes:
            raise HTTPException(413, f"{file.filename} is larger than {settings.max_upload_bytes // 1_000_000} MB.")
        try:
            pages, kind = extract_pages(file.filename or "", content)
        except UnsupportedFile as exc:
            raise HTTPException(415, f"{file.filename}: {exc}") from exc
        did = store.create_document(title_from(file.filename or "document", pages[0]), file.filename or "document", kind)
        background.add_task(ingest_document, store, index, embedder, settings, did, pages)
        created.append(store.get_document(did))
    return created
# endregion: upload


@router.post("/documents/samples", status_code=202)
def load_samples(
    background: BackgroundTasks,
    store: Store = Depends(get_store),
    index: Index = Depends(get_index),
    embedder: Embedder = Depends(get_embedder),
    settings: Settings = Depends(get_app_settings),
):
    """Add the bundled sample documents (once each)."""
    have = {d["filename"] for d in store.documents()}
    created = []
    for path in sorted(SAMPLES.glob("*.md")):
        if path.name in have:
            continue
        text = path.read_text(encoding="utf-8")
        did = store.create_document(title_from(path.name, text), path.name, "text")
        background.add_task(ingest_document, store, index, embedder, settings, did, [text])
        created.append(store.get_document(did))
    return created


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: str, store: Store = Depends(get_store), index: Index = Depends(get_index)):
    if not store.delete_document(document_id):
        raise HTTPException(404, "Document not found.")
    index.remove_document(document_id)


@router.get("/chunks/{chunk_id}")
def get_chunk(chunk_id: int, store: Store = Depends(get_store)):
    """One passage with its neighbours, so a reader can see a citation in context."""
    chunk = store.chunk_with_neighbours(chunk_id)
    if chunk is None:
        raise HTTPException(404, "Passage not found.")
    return chunk


# region: reindex
@router.post("/reindex")
def reindex(request: Request, store: Store = Depends(get_store), embedder: Embedder = Depends(get_embedder)):
    """Re-embed every passage with the current embedder. Needed after changing EMBEDDINGS_PROVIDER."""
    return {"reindexed": reindex_all(store, request.app.state, embedder)}
# endregion: reindex
