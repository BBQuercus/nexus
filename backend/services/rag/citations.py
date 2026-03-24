"""Citation formatting for RAG retrieval results."""

from __future__ import annotations

from backend.config import settings
from backend.services.rag.retrieval import RetrievalResult, ScoredChunk


def format_retrieval_context(result: RetrievalResult) -> tuple[str, float]:
    """Format retrieved chunks into context for the LLM prompt.

    Returns (context_text, confidence_score).
    """
    if not result.chunks:
        return "", 0.0

    confidence = result.confidence

    parts: list[str] = []

    if confidence < settings.RAG_CONFIDENCE_THRESHOLD:
        parts.append(
            "[RAG NOTE: The retrieved evidence has low relevance to this query. "
            "If you cannot find a clear answer in the sources below, say so explicitly "
            "rather than speculating.]\n"
        )

    for i, chunk in enumerate(result.chunks, 1):
        header_parts = [f'"{chunk.filename}"']
        if chunk.page_number:
            header_parts.append(f"Page {chunk.page_number}")
        if chunk.section_title:
            header_parts.append(f"Section: {chunk.section_title}")
        header_parts.append(f"Chunk {chunk.chunk_index}")
        header_parts.append(f"Score: {chunk.score:.2f}")

        header = ", ".join(header_parts)
        content = chunk.content
        if chunk.context_prefix:
            content = f"{chunk.context_prefix}\n\n{content}"

        parts.append(f"[Source {i}: {header}]\n{content}")

    return "\n\n---\n\n".join(parts), confidence


def _chunk_to_dict(chunk: ScoredChunk) -> dict:
    """Serialize a ScoredChunk to a JSON-safe dict."""
    return {
        "chunk_id": str(chunk.id),
        "document_id": str(chunk.document_id),
        "knowledge_base_id": str(chunk.knowledge_base_id) if chunk.knowledge_base_id else None,
        "filename": chunk.filename,
        "chunk_index": chunk.chunk_index,
        "page": chunk.page_number,
        "section": chunk.section_title,
        "score": round(chunk.score, 3),
        "snippet": chunk.content[:300],
    }


def build_citations_json(result: RetrievalResult) -> list[dict]:
    """Build citations JSON array for storing on messages."""
    return [_chunk_to_dict(chunk) for chunk in result.chunks]


def build_retrieval_sse_event(result: RetrievalResult) -> dict:
    """Build the retrieval_results SSE event payload."""
    return {
        "query": result.query,
        "confidence": round(result.confidence, 3),
        "sources": [_chunk_to_dict(chunk) for chunk in result.chunks],
    }
