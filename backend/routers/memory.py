"""CRUD API for AI memories."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user
from backend.db import get_db
from backend.models import Memory
from backend.services.memory import get_relevant_memories

router = APIRouter(prefix="/api/memory", tags=["memory"])


# ----- Schemas -----


class CreateMemoryRequest(BaseModel):
    scope: str = "global"
    category: str = "preference"
    content: str
    project_id: uuid.UUID | None = None
    source_conversation_id: uuid.UUID | None = None
    source_message_id: uuid.UUID | None = None


class UpdateMemoryRequest(BaseModel):
    scope: str | None = None
    category: str | None = None
    content: str | None = None
    active: bool | None = None
    project_id: uuid.UUID | None = None


def _serialize_memory(m: Memory) -> dict:
    return {
        "id": str(m.id),
        "user_id": str(m.user_id),
        "scope": m.scope,
        "category": m.category,
        "content": m.content,
        "project_id": str(m.project_id) if m.project_id else None,
        "source_conversation_id": str(m.source_conversation_id) if m.source_conversation_id else None,
        "source_message_id": str(m.source_message_id) if m.source_message_id else None,
        "relevance_count": m.relevance_count,
        "active": m.active,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }


# ----- Routes -----


@router.post("")
async def create_memory(
    body: CreateMemoryRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new memory."""
    valid_scopes = {"global", "project", "conversation"}
    valid_categories = {"preference", "fact", "decision", "instruction"}

    if body.scope not in valid_scopes:
        raise HTTPException(400, f"Invalid scope. Must be one of: {valid_scopes}")
    if body.category not in valid_categories:
        raise HTTPException(400, f"Invalid category. Must be one of: {valid_categories}")
    if not body.content.strip():
        raise HTTPException(400, "Content cannot be empty")

    mem = Memory(
        user_id=user_id,
        scope=body.scope,
        category=body.category,
        content=body.content.strip(),
        project_id=body.project_id,
        source_conversation_id=body.source_conversation_id,
        source_message_id=body.source_message_id,
    )
    db.add(mem)
    await db.commit()
    await db.refresh(mem)
    return _serialize_memory(mem)


@router.get("")
async def list_memories(
    scope: str | None = Query(None),
    category: str | None = Query(None),
    project_id: uuid.UUID | None = Query(None),
    active: bool | None = Query(None),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List user's memories with optional filters."""
    stmt = select(Memory).where(Memory.user_id == user_id)

    if scope:
        stmt = stmt.where(Memory.scope == scope)
    if category:
        stmt = stmt.where(Memory.category == category)
    if project_id:
        stmt = stmt.where(Memory.project_id == project_id)
    if active is not None:
        stmt = stmt.where(Memory.active == active)

    stmt = stmt.order_by(Memory.updated_at.desc())
    result = await db.execute(stmt)
    memories = result.scalars().all()
    return [_serialize_memory(m) for m in memories]


@router.put("/{memory_id}")
async def update_memory(
    memory_id: uuid.UUID,
    body: UpdateMemoryRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing memory."""
    result = await db.execute(
        select(Memory).where(Memory.id == memory_id, Memory.user_id == user_id)
    )
    mem = result.scalar_one_or_none()
    if not mem:
        raise HTTPException(404, "Memory not found")

    if body.scope is not None:
        mem.scope = body.scope
    if body.category is not None:
        mem.category = body.category
    if body.content is not None:
        mem.content = body.content.strip()
    if body.active is not None:
        mem.active = body.active
    if body.project_id is not None:
        mem.project_id = body.project_id

    await db.commit()
    await db.refresh(mem)
    return _serialize_memory(mem)


@router.delete("/{memory_id}")
async def delete_memory(
    memory_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Hard delete a memory."""
    result = await db.execute(
        select(Memory).where(Memory.id == memory_id, Memory.user_id == user_id)
    )
    mem = result.scalar_one_or_none()
    if not mem:
        raise HTTPException(404, "Memory not found")

    await db.delete(mem)
    await db.commit()
    return {"ok": True}


@router.get("/relevant")
async def get_relevant(
    context: str = Query(..., min_length=1),
    project_id: uuid.UUID | None = Query(None),
    limit: int = Query(10, ge=1, le=50),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get memories relevant to a context string."""
    memories = await get_relevant_memories(
        db=db,
        user_id=user_id,
        context=context,
        project_id=project_id,
        limit=limit,
    )
    return [_serialize_memory(m) for m in memories]
