"""Knowledge base and document management endpoints."""

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy import text as sa_text
from sqlalchemy.exc import DBAPIError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_org, get_current_user, get_org_db
from backend.logging_config import get_logger
from backend.models import Chunk, Document, KnowledgeBase
from backend.services.audit import AuditAction, record_audit_event
from backend.services.rag.ingestion import SUPPORTED_EXTENSIONS
from backend.services.rbac import require_permission
from backend.vector_db import get_vector_db

logger = get_logger("routers.knowledge")

router = APIRouter(prefix="/api/knowledge-bases", tags=["knowledge"])
doc_router = APIRouter(prefix="/api/conversations", tags=["knowledge"])
retrieval_router = APIRouter(prefix="/api/messages", tags=["knowledge"])


# ── Request/Response Models ──


class CreateKBRequest(BaseModel):
    name: str
    description: str | None = None
    embedding_model: str = "text-embedding-3-small"
    chunk_strategy: str = "contextual"
    is_public: bool = False


class UpdateKBRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    is_public: bool | None = None


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


# ── Serializers ──


def _serialize_kb(kb: KnowledgeBase) -> dict:
    return {
        "id": str(kb.id),
        "user_id": str(kb.user_id),
        "name": kb.name,
        "description": kb.description,
        "embedding_model": kb.embedding_model,
        "chunk_strategy": kb.chunk_strategy,
        "document_count": kb.document_count,
        "chunk_count": kb.chunk_count,
        "status": kb.status,
        "is_public": kb.is_public,
        "created_at": kb.created_at.isoformat() if kb.created_at else None,
        "updated_at": kb.updated_at.isoformat() if kb.updated_at else None,
    }


def _serialize_document(doc: Document) -> dict:
    return {
        "id": str(doc.id),
        "filename": doc.filename,
        "content_type": doc.content_type,
        "file_size_bytes": doc.file_size_bytes,
        "page_count": doc.page_count,
        "status": doc.status,
        "error_message": doc.error_message,
        "metadata": doc.metadata_,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


def _is_missing_table_error(exc: Exception, table: str) -> bool:
    message = str(getattr(exc, "orig", exc)).lower()
    return table.lower() in message and ("undefinedtable" in message or "does not exist" in message)


# ── Knowledge Base CRUD ──


@router.post("")
async def create_knowledge_base(
    body: CreateKBRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_vector_db),
):
    kb = KnowledgeBase(
        user_id=user_id,
        org_id=org_id,
        name=body.name,
        description=body.description,
        embedding_model=body.embedding_model,
        chunk_strategy=body.chunk_strategy,
        is_public=body.is_public,
    )
    db.add(kb)
    await db.flush()
    await db.commit()
    await record_audit_event(
        AuditAction.KB_CREATED, actor_id=str(user_id), resource_type="knowledge_base", resource_id=str(kb.id)
    )
    return _serialize_kb(kb)


@router.get("")
async def list_knowledge_bases(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_vector_db),
):
    try:
        result = await db.execute(
            select(KnowledgeBase)
            .where(
                or_(
                    KnowledgeBase.user_id == user_id,
                    KnowledgeBase.is_public == True,  # noqa: E712
                )
            )
            .order_by(KnowledgeBase.updated_at.desc())
        )
        return [_serialize_kb(kb) for kb in result.scalars().all()]
    except (ProgrammingError, DBAPIError) as exc:
        if not _is_missing_table_error(exc, "knowledge_bases"):
            raise
        logger.warning(
            "knowledge_base_table_missing",
            error=str(getattr(exc, "orig", exc)),
            user_id=str(user_id),
        )
        return []


@router.get("/{kb_id}")
async def get_knowledge_base(
    kb_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_vector_db),
):
    kb = await _get_kb_or_404(db, kb_id, user_id)
    return _serialize_kb(kb)


@router.patch("/{kb_id}")
async def update_knowledge_base(
    kb_id: uuid.UUID,
    body: UpdateKBRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_vector_db),
):
    kb = await _get_kb_owned_or_403(db, kb_id, user_id)
    if body.name is not None:
        kb.name = body.name
    if body.description is not None:
        kb.description = body.description
    if body.is_public is not None:
        kb.is_public = body.is_public
    await db.commit()
    return _serialize_kb(kb)


@router.delete("/{kb_id}")
async def delete_knowledge_base(
    kb_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_permission("kb.delete")),
    db: AsyncSession = Depends(get_vector_db),
):
    # Verify ownership without keeping the ORM object in session
    await _get_kb_owned_or_403(db, kb_id, user_id)
    db.expire_all()  # Evict loaded objects to prevent ORM cascade on commit

    # Delete children manually via raw SQL to avoid ORM cascade issues
    await _safe_delete_chunks(db, knowledge_base_id=kb_id)
    await db.execute(sa_text("DELETE FROM documents WHERE knowledge_base_id = :kid"), {"kid": str(kb_id)})
    await db.execute(sa_text("DELETE FROM knowledge_base_agents WHERE knowledge_base_id = :kid"), {"kid": str(kb_id)})
    await db.execute(sa_text("DELETE FROM knowledge_bases WHERE id = :kid"), {"kid": str(kb_id)})
    await db.commit()
    await record_audit_event(
        AuditAction.KB_DELETED, actor_id=str(user_id), resource_type="knowledge_base", resource_id=str(kb_id)
    )
    return {"ok": True}


# ── Document Upload & Management ──


@router.post("/{kb_id}/documents")
async def upload_documents(
    kb_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_vector_db),
):
    """Upload documents to a knowledge base. Processing happens in background."""
    kb = await _get_kb_owned_or_403(db, kb_id, user_id)

    documents = []
    tasks = []
    for file in files:
        _validate_file(file)
        file_bytes = await file.read()

        doc = Document(
            org_id=kb.org_id,
            knowledge_base_id=kb.id,
            user_id=user_id,
            filename=file.filename or "unnamed",
            content_type=file.content_type or "application/octet-stream",
            file_size_bytes=len(file_bytes),
            status="processing",
        )
        db.add(doc)
        await db.flush()
        documents.append(doc)
        tasks.append((doc.id, file_bytes, file.filename or "unnamed"))

    await db.commit()

    # Queue background ingestion for each document
    from backend.services.rag.pipeline import ingest_document

    for doc_id, file_bytes, fname in tasks:
        background_tasks.add_task(
            ingest_document,
            document_id=doc_id,
            file_bytes=file_bytes,
            filename=fname,
            knowledge_base_id=kb.id,
            chunk_strategy=kb.chunk_strategy,
            embedding_model=kb.embedding_model,
        )

    logger.info("documents_queued", kb_id=str(kb_id), count=len(documents))
    for doc in documents:
        await record_audit_event(
            AuditAction.KB_DOCUMENT_UPLOADED,
            actor_id=str(user_id),
            resource_type="document",
            resource_id=str(doc.id),
            details={"knowledge_base_id": str(kb_id), "filename": doc.filename},
        )
    return {"documents": [_serialize_document(d) for d in documents]}


@router.get("/{kb_id}/documents")
async def list_documents(
    kb_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_vector_db),
):
    await _get_kb_or_404(db, kb_id, user_id)
    result = await db.execute(
        select(Document).where(Document.knowledge_base_id == kb_id).order_by(Document.created_at.desc())
    )
    return [_serialize_document(d) for d in result.scalars().all()]


@router.get("/{kb_id}/documents/{doc_id}/content")
async def get_document_content(
    kb_id: uuid.UUID,
    doc_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_vector_db),
):
    """Return the extracted raw text for a document."""
    await _get_kb_or_404(db, kb_id, user_id)
    result = await db.execute(select(Document).where(Document.id == doc_id, Document.knowledge_base_id == kb_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "id": str(doc.id),
        "filename": doc.filename,
        "content_type": doc.content_type,
        "raw_text": doc.raw_text or "",
    }


@router.get("/{kb_id}/documents/{doc_id}/chunks")
async def get_document_chunks(
    kb_id: uuid.UUID,
    doc_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_vector_db),
):
    """Return all chunks for a document, ordered by chunk_index."""
    await _get_kb_or_404(db, kb_id, user_id)
    result = await db.execute(
        select(Chunk).where(Chunk.document_id == doc_id, Chunk.knowledge_base_id == kb_id).order_by(Chunk.chunk_index)
    )
    chunks = result.scalars().all()
    return [
        {
            "id": str(c.id),
            "chunk_index": c.chunk_index,
            "content": c.content,
            "context_prefix": c.context_prefix,
            "page_number": c.page_number,
            "section_title": c.section_title,
            "token_count": c.token_count,
        }
        for c in chunks
    ]


@router.delete("/{kb_id}/documents/{doc_id}")
async def delete_document(
    kb_id: uuid.UUID,
    doc_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_vector_db),
):
    await _get_kb_owned_or_403(db, kb_id, user_id)

    # Check existence without loading the ORM object (avoids cascade issues)
    from sqlalchemy import func as sa_func

    exists = await db.scalar(
        select(sa_func.count()).select_from(Document).where(Document.id == doc_id, Document.knowledge_base_id == kb_id)
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete chunks first, then the document — all via raw SQL to avoid ORM cascades
    await _safe_delete_chunks(db, document_id=doc_id)
    await db.execute(sa_text("DELETE FROM documents WHERE id = :did"), {"did": str(doc_id)})

    # Update KB counters
    from backend.services.rag.pipeline import _update_kb_counters

    await _update_kb_counters(db, kb_id)

    await db.commit()
    return {"ok": True}


# ── Direct Search (testing/debug) ──


@router.post("/{kb_id}/search")
async def search_knowledge_base(
    kb_id: uuid.UUID,
    body: SearchRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_vector_db),
):
    """Search a knowledge base directly (useful for testing)."""
    await _get_kb_or_404(db, kb_id, user_id)

    from backend.services.rag.retrieval import SearchScope, retrieve

    result = await retrieve(
        db=db,
        query=body.query,
        scope=SearchScope(knowledge_base_ids=[kb_id]),
        top_k=body.top_k,
    )

    return {
        "query": result.query,
        "confidence": round(result.confidence, 3),
        "total_candidates": result.total_candidates,
        "retrieval_time_ms": result.retrieval_time_ms,
        "rerank_time_ms": result.rerank_time_ms,
        "results": [
            {
                "chunk_id": str(c.id),
                "document_id": str(c.document_id),
                "filename": c.filename,
                "page": c.page_number,
                "section": c.section_title,
                "score": round(c.score, 3),
                "content": c.content,
                "context_prefix": c.context_prefix,
            }
            for c in result.chunks
        ],
    }


@router.get("/{kb_id}/stats")
async def get_kb_stats(
    kb_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_vector_db),
):
    kb = await _get_kb_or_404(db, kb_id, user_id)
    from sqlalchemy import func

    total_tokens = await db.scalar(select(func.sum(Chunk.token_count)).where(Chunk.knowledge_base_id == kb_id))

    return {
        "document_count": kb.document_count,
        "chunk_count": kb.chunk_count,
        "total_tokens": total_tokens or 0,
        "embedding_model": kb.embedding_model,
        "chunk_strategy": kb.chunk_strategy,
    }


# ── Conversation-scoped Documents ──


@doc_router.post("/{conv_id}/documents")
async def upload_conversation_documents(
    conv_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_vector_db),
    primary_db: AsyncSession = Depends(get_org_db),
):
    """Upload documents scoped to a conversation (no KB needed)."""
    from backend.models import Conversation

    result = await primary_db.execute(
        select(Conversation).where(Conversation.id == conv_id, Conversation.user_id == user_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    documents = []
    tasks = []
    for file in files:
        _validate_file(file)
        file_bytes = await file.read()

        doc = Document(
            org_id=conv.org_id,
            user_id=user_id,
            conversation_id=conv_id,
            filename=file.filename or "unnamed",
            content_type=file.content_type or "application/octet-stream",
            file_size_bytes=len(file_bytes),
            status="processing",
        )
        db.add(doc)
        await db.flush()
        documents.append(doc)
        tasks.append((doc.id, file_bytes, file.filename or "unnamed"))

    await db.commit()

    from backend.services.rag.pipeline import ingest_document

    for doc_id, file_bytes, fname in tasks:
        background_tasks.add_task(
            ingest_document,
            document_id=doc_id,
            file_bytes=file_bytes,
            filename=fname,
            conversation_id=conv_id,
        )

    return {"documents": [_serialize_document(d) for d in documents]}


@doc_router.get("/{conv_id}/documents")
async def list_conversation_documents(
    conv_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_vector_db),
    primary_db: AsyncSession = Depends(get_org_db),
):
    from backend.models import Conversation

    result = await primary_db.execute(
        select(Conversation).where(Conversation.id == conv_id, Conversation.user_id == user_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    doc_result = await db.execute(
        select(Document).where(Document.conversation_id == conv_id).order_by(Document.created_at.desc())
    )
    return [_serialize_document(d) for d in doc_result.scalars().all()]


# ── Retrieval Log ──


@retrieval_router.get("/{msg_id}/retrieval")
async def get_retrieval_log(
    msg_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_vector_db),
):
    """Get retrieval log for a message (shows why sources were chosen)."""
    from backend.models import RetrievalLog

    result = await db.execute(select(RetrievalLog).where(RetrievalLog.message_id == msg_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="No retrieval log for this message")
    return {
        "id": str(log.id),
        "message_id": str(log.message_id),
        "query": log.query,
        "rewritten_queries": log.rewritten_queries,
        "chunks_retrieved": log.chunks_retrieved,
        "total_candidates": log.total_candidates,
        "retrieval_time_ms": log.retrieval_time_ms,
        "rerank_time_ms": log.rerank_time_ms,
    }


# ── Helpers ──


def _validate_file(file: UploadFile) -> None:
    """Validate file extension and size."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename required")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: .{ext}. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )


async def _get_kb_or_404(db: AsyncSession, kb_id: uuid.UUID, user_id: uuid.UUID) -> KnowledgeBase:
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    if kb.user_id != user_id and not kb.is_public:
        raise HTTPException(status_code=403, detail="Access denied")
    return kb


async def _get_kb_owned_or_403(db: AsyncSession, kb_id: uuid.UUID, user_id: uuid.UUID) -> KnowledgeBase:
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == user_id))
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found or not owned by you")
    return kb


async def _safe_delete_chunks(
    db: AsyncSession,
    knowledge_base_id: uuid.UUID | None = None,
    document_id: uuid.UUID | None = None,
) -> None:
    """Delete chunks, ignoring errors if the chunks table doesn't exist (no pgvector).

    Uses a savepoint so a failure doesn't abort the outer transaction.
    """
    try:
        async with db.begin_nested():
            if document_id:
                await db.execute(sa_text("DELETE FROM chunks WHERE document_id = :did"), {"did": str(document_id)})
            elif knowledge_base_id:
                await db.execute(
                    sa_text("DELETE FROM chunks WHERE knowledge_base_id = :kid"), {"kid": str(knowledge_base_id)}
                )
    except Exception:
        # chunks table doesn't exist — savepoint rolled back, outer txn intact
        pass
