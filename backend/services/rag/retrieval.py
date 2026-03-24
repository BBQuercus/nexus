"""Hybrid search (vector + BM25) with optional reranking and confidence scoring."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.logging_config import get_logger
from backend.models import Chunk, Document

logger = get_logger("rag.retrieval")


@dataclass
class SearchScope:
    """Defines where to search."""
    knowledge_base_ids: list[uuid.UUID] = field(default_factory=list)
    conversation_id: uuid.UUID | None = None


@dataclass
class ScoredChunk:
    """A chunk with retrieval scores and source metadata."""
    id: uuid.UUID
    document_id: uuid.UUID
    content: str
    context_prefix: str | None
    filename: str
    page_number: int | None
    section_title: str | None
    score: float  # final score after fusion/reranking
    rerank_score: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class RetrievalResult:
    """Complete result of a retrieval operation."""
    chunks: list[ScoredChunk]
    query: str
    sub_queries: list[str] | None = None
    total_candidates: int = 0
    retrieval_time_ms: int = 0
    rerank_time_ms: int | None = None
    confidence: float = 0.0


def _build_scope_filter(scope: SearchScope) -> tuple[str, dict]:
    """Build SQL WHERE clause for scoping."""
    conditions = []
    params: dict[str, Any] = {}

    if scope.knowledge_base_ids:
        conditions.append("c.knowledge_base_id = ANY(:kb_ids)")
        params["kb_ids"] = [str(uid) for uid in scope.knowledge_base_ids]
    if scope.conversation_id:
        conditions.append("c.conversation_id = :conv_id")
        params["conv_id"] = str(scope.conversation_id)

    if not conditions:
        return "FALSE", params  # No scope = no results

    return " OR ".join(conditions), params


async def _vector_search(
    db: AsyncSession,
    query_embedding: list[float],
    scope: SearchScope,
    top_k: int = 20,
) -> list[tuple[uuid.UUID, float]]:
    """Cosine similarity search via pgvector."""
    scope_clause, params = _build_scope_filter(scope)
    params["query_vec"] = str(query_embedding)
    params["top_k"] = top_k

    sql = text(f"""
        SELECT c.id, 1 - (c.embedding <=> :query_vec::vector) AS similarity
        FROM chunks c
        WHERE c.embedding IS NOT NULL AND ({scope_clause})
        ORDER BY c.embedding <=> :query_vec::vector
        LIMIT :top_k
    """)

    result = await db.execute(sql, params)
    return [(row[0], float(row[1])) for row in result.fetchall()]


async def _bm25_search(
    db: AsyncSession,
    query: str,
    scope: SearchScope,
    top_k: int = 20,
) -> list[tuple[uuid.UUID, float]]:
    """Full-text BM25 search via PostgreSQL tsvector."""
    scope_clause, params = _build_scope_filter(scope)
    params["query"] = query
    params["top_k"] = top_k

    sql = text(f"""
        SELECT c.id, ts_rank(c.tsv, plainto_tsquery('english', :query)) AS rank
        FROM chunks c
        WHERE c.tsv @@ plainto_tsquery('english', :query) AND ({scope_clause})
        ORDER BY rank DESC
        LIMIT :top_k
    """)

    result = await db.execute(sql, params)
    return [(row[0], float(row[1])) for row in result.fetchall()]


def _rrf_merge(
    vector_results: list[tuple[uuid.UUID, float]],
    bm25_results: list[tuple[uuid.UUID, float]],
    k: int = 60,
) -> list[tuple[uuid.UUID, float]]:
    """Reciprocal Rank Fusion to combine vector and BM25 results."""
    scores: dict[uuid.UUID, float] = {}

    for rank, (chunk_id, _) in enumerate(vector_results):
        scores[chunk_id] = scores.get(chunk_id, 0) + 1.0 / (k + rank + 1)

    for rank, (chunk_id, _) in enumerate(bm25_results):
        scores[chunk_id] = scores.get(chunk_id, 0) + 1.0 / (k + rank + 1)

    return sorted(scores.items(), key=lambda x: x[1], reverse=True)


async def _load_chunks(
    db: AsyncSession,
    chunk_ids: list[uuid.UUID],
    scores: dict[uuid.UUID, float],
) -> list[ScoredChunk]:
    """Load full chunk data with document metadata."""
    if not chunk_ids:
        return []

    stmt = (
        select(Chunk, Document.filename)
        .join(Document, Chunk.document_id == Document.id)
        .where(Chunk.id.in_(chunk_ids))
    )
    result = await db.execute(stmt)

    chunk_map: dict[uuid.UUID, ScoredChunk] = {}
    for chunk, filename in result.fetchall():
        chunk_map[chunk.id] = ScoredChunk(
            id=chunk.id,
            document_id=chunk.document_id,
            content=chunk.content,
            context_prefix=chunk.context_prefix,
            filename=filename,
            page_number=chunk.page_number,
            section_title=chunk.section_title,
            score=scores.get(chunk.id, 0.0),
            metadata=chunk.metadata_ or {},
        )

    # Preserve score ordering
    return [chunk_map[cid] for cid in chunk_ids if cid in chunk_map]


async def _rerank(
    query: str,
    chunks: list[ScoredChunk],
    top_k: int = 5,
) -> list[ScoredChunk]:
    """Rerank using Cohere Rerank via API. Falls back to existing scores if unavailable."""
    if not settings.COHERE_API_KEY or not settings.RERANK_MODEL:
        return chunks[:top_k]

    try:
        import cohere

        co = cohere.AsyncClientV2(api_key=settings.COHERE_API_KEY)
        documents = [c.content for c in chunks]

        response = await co.rerank(
            model=settings.RERANK_MODEL,
            query=query,
            documents=documents,
            top_n=top_k,
        )

        reranked: list[ScoredChunk] = []
        for result in response.results:
            chunk = chunks[result.index]
            chunk.rerank_score = result.relevance_score
            chunk.score = result.relevance_score
            reranked.append(chunk)

        logger.info("reranked", query_len=len(query), candidates=len(chunks), results=len(reranked))
        return reranked
    except Exception:
        logger.exception("rerank_failed_fallback")
        return chunks[:top_k]


async def retrieve(
    db: AsyncSession,
    query: str,
    scope: SearchScope,
    top_k: int = 5,
    search_top_k: int = 20,
) -> RetrievalResult:
    """Full retrieval pipeline: hybrid search → rerank → confidence score.

    Args:
        db: Database session
        query: User query
        scope: Where to search (KB IDs and/or conversation ID)
        top_k: Final number of results to return
        search_top_k: Number of candidates from each search method before fusion
    """
    start = time.monotonic()

    # Import here to avoid circular deps
    from backend.services.rag.embeddings import embed_query

    # Run vector search and BM25 in parallel
    import asyncio

    query_embedding = await embed_query(query)
    vector_results, bm25_results = await asyncio.gather(
        _vector_search(db, query_embedding, scope, top_k=search_top_k),
        _bm25_search(db, query, scope, top_k=search_top_k),
    )

    # Reciprocal Rank Fusion
    fused = _rrf_merge(vector_results, bm25_results)
    total_candidates = len(fused)
    retrieval_ms = int((time.monotonic() - start) * 1000)

    # Load full chunk data for top candidates
    candidate_ids = [cid for cid, _ in fused[:search_top_k]]
    score_map = dict(fused)
    chunks = await _load_chunks(db, candidate_ids, score_map)

    # Rerank
    rerank_start = time.monotonic()
    reranked = await _rerank(query, chunks, top_k=top_k)
    rerank_ms = int((time.monotonic() - rerank_start) * 1000) if settings.RERANK_MODEL else None

    # Confidence score = best chunk score (normalized to 0-1)
    confidence = reranked[0].score if reranked else 0.0
    # Normalize RRF scores (they're typically small) to 0-1 range for display
    if reranked and not any(c.rerank_score is not None for c in reranked):
        max_score = max(c.score for c in reranked) if reranked else 1.0
        if max_score > 0:
            for c in reranked:
                c.score = c.score / max_score
            confidence = 1.0 if reranked else 0.0

    total_ms = int((time.monotonic() - start) * 1000)
    logger.info(
        "retrieval_complete",
        query_len=len(query),
        vector_hits=len(vector_results),
        bm25_hits=len(bm25_results),
        total_candidates=total_candidates,
        results=len(reranked),
        confidence=round(confidence, 3),
        time_ms=total_ms,
    )

    return RetrievalResult(
        chunks=reranked,
        query=query,
        total_candidates=total_candidates,
        retrieval_time_ms=retrieval_ms,
        rerank_time_ms=rerank_ms,
        confidence=confidence,
    )
