"""Ingestion: file -> pages -> chunks -> vectors -> database and search index. Runs in a background thread."""
import io
from collections.abc import Callable
from pathlib import Path

import numpy as np
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from .config import Settings
from .db import Store
from .rag.chunker import Chunk, chunk_text
from .rag.embeddings import Embedder
from .rag.index import Index


class UnsupportedFile(Exception):
    pass


# region: pages
def extract_pages(filename: str, content: bytes) -> tuple[list[str], str]:
    """Return (the text of each page, kind). Text and Markdown files are a single page."""
    name = filename.lower()
    if name.endswith((".txt", ".md", ".markdown")):
        return [content.decode("utf-8", errors="replace")], "text"
    if name.endswith(".pdf"):
        try:
            pages = [(p.extract_text() or "") for p in PdfReader(io.BytesIO(content)).pages]
        except (PdfReadError, ValueError) as exc:
            raise UnsupportedFile("That PDF could not be read.") from exc
        if not any(p.strip() for p in pages):
            raise UnsupportedFile("This PDF has no text layer (it looks like a scan). Run OCR on it first.")
        return pages, "pdf"
    raise UnsupportedFile("Upload a .txt, .md or .pdf file.")
# endregion: pages


# region: chunk-pages
def title_from(filename: str, text: str = "") -> str:
    """The document's first Markdown heading if it has one, otherwise the file name made readable."""
    heading = next((line.lstrip("# ").strip() for line in text.splitlines() if line.startswith("# ")), "")
    return heading or Path(filename).stem.replace("-", " ").replace("_", " ").strip().title() or filename


def chunk_pages(pages: list[str], size: int, overlap: int) -> list[Chunk]:
    chunks: list[Chunk] = []
    for number, text in enumerate(pages, start=1):
        chunks += chunk_text(text, size, overlap, page=number, first_ordinal=len(chunks))
    return chunks


def embedding_text(chunk: Chunk) -> str:
    """The heading travels with the chunk: "Leave" makes "6 days carry over" findable by someone asking about leave."""
    return f"{chunk.heading}\n{chunk.text}" if chunk.heading else chunk.text
# endregion: chunk-pages


# region: ingest
def ingest_document(
    store: Store, index: Index, embedder: Embedder, settings: Settings, document_id: str, pages: list[str],
    on_progress: Callable[[float], None] | None = None,
) -> None:
    """Chunk, embed and index one document. Failures are recorded on the document, never raised into the void."""
    try:
        store.update_document(document_id, status="parsing", pages=len(pages))
        chunks = chunk_pages(pages, settings.chunk_size, settings.chunk_overlap)
        if not chunks:
            raise ValueError("The document has no readable text.")

        store.update_document(document_id, status="embedding", n_chunks=len(chunks), progress=0.0)
        texts = [embedding_text(c) for c in chunks]
        vectors = []
        for i in range(0, len(texts), 32):                                  # embed in batches so we can report progress
            vectors.append(embedder.embed(texts[i:i + 32], kind="document"))
            progress = min(1.0, (i + 32) / len(texts))
            store.update_document(document_id, progress=progress)
            if on_progress:
                on_progress(progress)
        matrix = np.vstack(vectors)

        rows = [{"ordinal": c.ordinal, "page": c.page, "start": c.start, "end": c.end, "heading": c.heading, "text": c.text} for c in chunks]
        chunk_ids = store.add_chunks(document_id, rows, matrix, embedder.name)
        index.add(chunk_ids, document_id, texts, matrix)                    # searchable from this moment
        store.update_document(document_id, status="ready", progress=1.0)
    except Exception as exc:                                                # noqa: BLE001: record every failure on the document
        store.update_document(document_id, status="failed", error=str(exc)[:300])
# endregion: ingest


# region: rebuild
def build_index(store: Store, embedder: Embedder) -> Index:
    """Rebuild the in-memory index from SQLite at start-up: vectors are read back, nothing is re-embedded."""
    index = Index(embedder)
    by_doc: dict[str, list[dict]] = {}
    for row in store.indexable_chunks(embedder.name):
        by_doc.setdefault(row["document_id"], []).append(row)
    for document_id, rows in by_doc.items():
        texts = [f'{r["heading"]}\n{r["text"]}' if r["heading"] else r["text"] for r in rows]
        index.add([r["id"] for r in rows], document_id, texts, np.vstack([r["embedding"] for r in rows]))
    return index


def reindex_all(store: Store, index_holder, embedder: Embedder) -> int:
    """Re-embed every chunk with the CURRENT embedder (needed after you change EMBEDDINGS_PROVIDER). Returns how many."""
    stale = store.stale_chunks(embedder.name)
    for i in range(0, len(stale), 32):
        batch = stale[i:i + 32]
        texts = [f'{r["heading"]}\n{r["text"]}' if r["heading"] else r["text"] for r in batch]
        store.set_embeddings([r["id"] for r in batch], embedder.embed(texts, kind="document"), embedder.name)
    index_holder.index = build_index(store, embedder)
    return len(stale)
# endregion: rebuild
