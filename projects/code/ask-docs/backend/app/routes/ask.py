import time
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends

from fastapi.responses import StreamingResponse

from ..config import Settings
from ..db import Store
from ..deps import get_app_settings, get_embedder, get_index, get_llm, get_store
from ..llm import LLMClient, LLMError, StreamDone, TextDelta, Usage
from ..pricing import cost_usd
from ..rag.embeddings import Embedder
from ..rag.gate import is_relevant
from ..rag.index import Hit, Index
from ..rag.prompt import REFUSAL, SYSTEM, build_messages, check_citations
from ..rag.rewrite import standalone_question
from ..schemas import AskRequest, SearchRequest
from ..sse import SSE_HEADERS, sse

router = APIRouter(prefix="/api", tags=["ask"])


# region: sources
def sources_for(hits: list[Hit], store: Store) -> list[dict]:
    """Join search hits with their chunk text and document, numbered from 1: the numbers the model will cite."""
    rows = store.chunks_by_ids([h.chunk_id for h in hits])
    out = []
    for n, hit in enumerate((h for h in hits if h.chunk_id in rows), start=1):
        row = rows[hit.chunk_id]
        out.append({
            "n": n, "chunk_id": hit.chunk_id, "document_id": row["document_id"], "document": row["document"], "page": row["page"],
            "heading": row["heading"], "text": row["text"],
            "score": round(hit.score, 4), "vector_score": hit.vector_score and round(hit.vector_score, 3), "keyword_score": hit.keyword_score and round(hit.keyword_score, 2),
            "vector_rank": hit.vector_rank, "keyword_rank": hit.keyword_rank,
        })
    return out
# endregion: sources


@router.post("/search")
def search(body: SearchRequest, store: Store = Depends(get_store), index: Index = Depends(get_index)):
    """Retrieval only, no model: used to see (and debug) what the search finds."""
    hits = index.search(body.query, body.mode, body.top_k, set(body.document_ids) if body.document_ids else None)
    return {"query": body.query, "mode": body.mode, "sources": sources_for(hits, store)}


# region: ask-events
async def ask_events(
    body: AskRequest, *, llm: LLMClient, store: Store, index: Index, embedder: Embedder, settings: Settings,
) -> AsyncIterator[str]:
    """One question, as events: rewrite, sources, delta..., citations, usage, done (or error)."""
    usage = Usage()
    try:
        history = [t.model_dump() for t in body.history]
        query, rewrite_usage = await standalone_question(llm, body.question, history)
        usage = usage + rewrite_usage                                     # the rewrite is a paid call too
        yield sse("rewrite", {"question": body.question, "standalone": query, "rewritten": query != body.question})

        hits = index.search(query, body.mode, body.top_k, set(body.document_ids) if body.document_ids else None)
        sources = sources_for(hits, store)
        relevant = is_relevant(hits, embedder.relevance_threshold, settings.keyword_threshold)
        yield sse("sources", {"sources": sources if relevant else [], "relevant": relevant})

        answer = ""
        if not relevant:
            answer = REFUSAL                                           # nothing useful found: do not pay for a model call
            yield sse("delta", {"text": answer})
        else:
            messages = build_messages(body.question, sources, history)
            async for event in llm.stream(system=SYSTEM, messages=messages, max_tokens=settings.max_output_tokens):
                if isinstance(event, TextDelta):
                    answer += event.text
                    yield sse("delta", {"text": event.text})
                elif isinstance(event, StreamDone):
                    usage = usage + event.usage

        yield sse("citations", check_citations(answer, len(sources) if relevant else 0))
        yield sse("usage", {"input_tokens": usage.input_tokens, "output_tokens": usage.output_tokens,
                            "cost_usd": cost_usd(llm.model, usage.input_tokens, usage.output_tokens)})
        yield sse("done", {})
    except LLMError as exc:
        yield sse("error", {"code": exc.code, "message": exc.message, "retryable": exc.retryable})
# endregion: ask-events


# region: ask-route
@router.post("/ask")
async def ask(
    body: AskRequest,
    llm: LLMClient = Depends(get_llm),
    store: Store = Depends(get_store),
    index: Index = Depends(get_index),
    embedder: Embedder = Depends(get_embedder),
    settings: Settings = Depends(get_app_settings),
) -> StreamingResponse:
    stream = ask_events(body, llm=llm, store=store, index=index, embedder=embedder, settings=settings)
    return StreamingResponse(stream, media_type="text/event-stream", headers=SSE_HEADERS)
# endregion: ask-route
