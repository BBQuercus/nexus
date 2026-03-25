"""Hybrid search (vector + BM25) with optional reranking and confidence scoring."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from sqlalchemy import select, text

if TYPE_CHECKING:
    import uuid

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
    knowledge_base_id: uuid.UUID | None
    content: str
    context_prefix: str | None
    filename: str
    chunk_index: int
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

    # Use CAST() instead of :: to avoid collisions with SQLAlchemy's
    # :bind_param syntax (`:query_vec::vector` is ambiguous).
    sql = text(f"""
        SELECT c.id, 1 - (c.embedding <=> CAST(:query_vec AS vector)) AS similarity
        FROM chunks c
        WHERE c.embedding IS NOT NULL AND ({scope_clause})
        ORDER BY c.embedding <=> CAST(:query_vec AS vector)
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
) -> tuple[list[tuple[uuid.UUID, float]], dict[uuid.UUID, float]]:
    """Reciprocal Rank Fusion to combine vector and BM25 results.

    Returns (ranked_ids_with_rrf_scores, vector_similarity_map).
    The vector_similarity_map contains real 0-1 cosine similarity scores
    for display purposes (RRF scores are small arbitrary numbers).
    """
    scores: dict[uuid.UUID, float] = {}
    vector_sim: dict[uuid.UUID, float] = {}

    for rank, (chunk_id, similarity) in enumerate(vector_results):
        scores[chunk_id] = scores.get(chunk_id, 0) + 1.0 / (k + rank + 1)
        vector_sim[chunk_id] = similarity  # real cosine similarity 0-1

    for rank, (chunk_id, _) in enumerate(bm25_results):
        scores[chunk_id] = scores.get(chunk_id, 0) + 1.0 / (k + rank + 1)

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return ranked, vector_sim


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
            knowledge_base_id=chunk.knowledge_base_id,
            content=chunk.content,
            context_prefix=chunk.context_prefix,
            filename=filename,
            chunk_index=chunk.chunk_index,
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

    # Run vector search and BM25 sequentially — SQLAlchemy async
    # sessions are NOT safe for concurrent queries via asyncio.gather.
    query_embedding = await embed_query(query)
    vector_results = await _vector_search(db, query_embedding, scope, top_k=search_top_k)
    bm25_results = await _bm25_search(db, query, scope, top_k=search_top_k)

    # Reciprocal Rank Fusion
    fused, vector_sim = _rrf_merge(vector_results, bm25_results)
    total_candidates = len(fused)
    retrieval_ms = int((time.monotonic() - start) * 1000)

    # Use real cosine similarity scores for display (not RRF rank scores).
    # Chunks that only appeared in BM25 get a default low similarity.
    display_scores = {cid: vector_sim.get(cid, 0.2) for cid, _ in fused}

    # Load full chunk data for top candidates
    candidate_ids = [cid for cid, _ in fused[:search_top_k]]
    chunks = await _load_chunks(db, candidate_ids, display_scores)

    # Rerank
    rerank_start = time.monotonic()
    reranked = await _rerank(query, chunks, top_k=top_k)
    rerank_ms = int((time.monotonic() - rerank_start) * 1000) if settings.RERANK_MODEL else None

    # Confidence = best chunk's real similarity score
    confidence = reranked[0].score if reranked else 0.0

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
