"""End-to-end document processing pipeline (runs as a background task)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select, update

if TYPE_CHECKING:
    import uuid

    from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.logging_config import get_logger
from backend.models import Chunk, Document, KnowledgeBase
from backend.vector_db import vector_async_session

logger = get_logger("rag.pipeline")


async def ingest_document(
    document_id: uuid.UUID,
    file_bytes: bytes,
    filename: str,
    knowledge_base_id: uuid.UUID | None = None,
    conversation_id: uuid.UUID | None = None,
    chunk_strategy: str = "contextual",
    embedding_model: str | None = None,
) -> None:
    """Full ingestion pipeline: parse → chunk → (contextual prefix) → embed → store.

    Runs as a background task. Updates document and KB status on completion/error.
    """
    embedding_model = embedding_model or settings.EMBEDDING_MODEL

    async with vector_async_session() as db:
        try:
            # 0. Pre-flight: check that the chunks table exists (requires pgvector)
            from sqlalchemy import text as sa_text

            try:
                await db.execute(sa_text("SELECT 1 FROM chunks LIMIT 0"))
            except Exception:
                await db.rollback()
                await _mark_document_error(
                    db,
                    document_id,
                    "RAG storage unavailable: pgvector extension is not installed. "
                    "Install pgvector on your PostgreSQL server to enable document processing.",
                )
                await db.commit()
                logger.warning("chunks_table_missing", document_id=str(document_id))
                return

            # 1. Parse document into chunks
            import asyncio
            import functools

            from backend.services.rag.ingestion import parse_document

            await db.execute(
                update(Document).where(Document.id == document_id).values(processing_stage="splitting")
            )
            await db.commit()

            # Run CPU-heavy parsing in a thread so the event loop stays free
            loop = asyncio.get_event_loop()
            parsed = await loop.run_in_executor(None, functools.partial(parse_document, file_bytes, filename))

            # Update document with parsed metadata
            await db.execute(
                update(Document)
                .where(Document.id == document_id)
                .values(
                    raw_text=parsed.raw_text[:50_000],  # Cap stored raw text
                    page_count=parsed.page_count,
                    metadata_=parsed.metadata,
                )
            )
            await db.commit()

            if not parsed.chunks:
                await _mark_document_error(db, document_id, "No text content extracted")
                return

            logger.info(
                "document_parsed",
                document_id=str(document_id),
                filename=filename,
                chunks=len(parsed.chunks),
            )

            # 2. Generate contextual prefixes (if strategy is "contextual")
            prefixes: list[str] = [""] * len(parsed.chunks)
            if chunk_strategy == "contextual" and parsed.raw_text:
                from backend.services.rag.contextual import generate_context_prefixes

                await db.execute(
                    update(Document).where(Document.id == document_id).values(processing_stage="contextualizing")
                )
                await db.commit()

                chunk_texts = [c.content for c in parsed.chunks]
                prefixes = await generate_context_prefixes(
                    parsed.raw_text[:15_000],
                    chunk_texts,
                )

            # 3. Generate embeddings
            from backend.services.rag.embeddings import embed_texts

            n_chunks = len(parsed.chunks)
            await db.execute(
                update(Document)
                .where(Document.id == document_id)
                .values(processing_stage="encoding", chunks_total=n_chunks, chunks_done=0)
            )
            await db.commit()

            # Embed the combined prefix + content for better retrieval
            texts_to_embed = [
                f"{prefix}\n\n{chunk.content}" if prefix else chunk.content
                for prefix, chunk in zip(prefixes, parsed.chunks, strict=False)
            ]

            async def _on_batch(chunks_done: int) -> None:
                await db.execute(
                    update(Document).where(Document.id == document_id).values(chunks_done=chunks_done)
                )
                await db.commit()

            embeddings = await embed_texts(texts_to_embed, model=embedding_model, on_batch_complete=_on_batch)

            logger.info(
                "embeddings_complete",
                document_id=str(document_id),
                count=len(embeddings),
            )

            await db.execute(
                update(Document).where(Document.id == document_id).values(processing_stage="storing")
            )
            await db.commit()

            # 4. Store chunks with embeddings
            # Get org_id from the document record
            doc_result = await db.execute(
                select(Document.org_id).where(Document.id == document_id)
            )
            doc_org_id = doc_result.scalar_one_or_none()

            chunk_records = []
            for _i, (parsed_chunk, prefix, embedding) in enumerate(
                zip(parsed.chunks, prefixes, embeddings, strict=False)
            ):
                chunk_kwargs: dict = {
                    "document_id": document_id,
                    "knowledge_base_id": knowledge_base_id,
                    "conversation_id": conversation_id,
                    "content": parsed_chunk.content,
                    "context_prefix": prefix or None,
                    "chunk_index": parsed_chunk.chunk_index,
                    "page_number": parsed_chunk.page_number,
                    "section_title": parsed_chunk.section_title,
                    "embedding": embedding,
                    "token_count": parsed_chunk.token_count,
                    "metadata_": parsed_chunk.metadata,
                }
                if doc_org_id is not None:
                    chunk_kwargs["org_id"] = doc_org_id
                chunk_records.append(Chunk(**chunk_kwargs))

            db.add_all(chunk_records)

            # 5. Mark document as ready
            await db.execute(
                update(Document)
                .where(Document.id == document_id)
                .values(status="ready", processing_stage=None, chunks_done=n_chunks)
            )

            # 6. Update KB counters
            if knowledge_base_id:
                await _update_kb_counters(db, knowledge_base_id)

            await db.commit()

            logger.info(
                "document_ingested",
                document_id=str(document_id),
                filename=filename,
                chunks_stored=len(chunk_records),
            )

        except Exception as e:
            await db.rollback()
            logger.exception(
                "ingestion_failed",
                document_id=str(document_id),
                filename=filename,
            )
            # Mark document as errored in a new transaction
            async with vector_async_session() as err_db:
                await _mark_document_error(err_db, document_id, str(e))
                await err_db.commit()


async def _mark_document_error(
    db: AsyncSession,
    document_id: uuid.UUID,
    error_message: str,
) -> None:
    await db.execute(
        update(Document).where(Document.id == document_id).values(status="error", error_message=error_message[:2000])
    )


async def _update_kb_counters(db: AsyncSession, kb_id: uuid.UUID) -> None:
    """Recalculate document_count and chunk_count for a knowledge base."""
    from sqlalchemy import func

    doc_count = await db.scalar(
        select(func.count())
        .select_from(Document)
        .where(
            Document.knowledge_base_id == kb_id,
            Document.status == "ready",
        )
    )
    chunk_count = await db.scalar(
        select(func.count())
        .select_from(Chunk)
        .where(
            Chunk.knowledge_base_id == kb_id,
        )
    )

    await db.execute(
        update(KnowledgeBase)
        .where(KnowledgeBase.id == kb_id)
        .values(
            document_count=doc_count or 0,
            chunk_count=chunk_count or 0,
        )
    )


async def delete_document_chunks(
    db: AsyncSession,
    document_id: uuid.UUID,
) -> None:
    """Delete all chunks for a document (cascade handles this, but explicit for clarity)."""
    from sqlalchemy import delete

    await db.execute(delete(Chunk).where(Chunk.document_id == document_id))
