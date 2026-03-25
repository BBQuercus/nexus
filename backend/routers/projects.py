import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user
from backend.db import get_db
from backend.models import Conversation, Project

router = APIRouter(prefix="/api/projects", tags=["projects"])


# ----- Schemas -----


class CreateProjectRequest(BaseModel):
    name: str
    description: str | None = None
    icon: str | None = None
    color: str | None = None
    default_model: str | None = None
    default_persona_id: uuid.UUID | None = None
    knowledge_base_ids: list[str] | None = None
    settings: dict[str, Any] | None = None


class UpdateProjectRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    color: str | None = None
    default_model: str | None = None
    default_persona_id: uuid.UUID | None = None
    knowledge_base_ids: list[str] | None = None
    pinned_conversation_ids: list[str] | None = None
    settings: dict[str, Any] | None = None
    archived: bool | None = None


class MoveConversationRequest(BaseModel):
    conversation_id: uuid.UUID


def _serialize_project(p: Project, conversation_count: int = 0) -> dict:
    return {
        "id": str(p.id),
        "user_id": str(p.user_id),
        "name": p.name,
        "description": p.description,
        "icon": p.icon,
        "color": p.color,
        "default_model": p.default_model,
        "default_persona_id": str(p.default_persona_id) if p.default_persona_id else None,
        "knowledge_base_ids": p.knowledge_base_ids or [],
        "pinned_conversation_ids": p.pinned_conversation_ids or [],
        "settings": p.settings or {},
        "archived": p.archived,
        "conversation_count": conversation_count,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


@router.post("")
async def create_project(
    body: CreateProjectRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = Project(
        user_id=user_id,
        name=body.name,
        description=body.description,
        icon=body.icon,
        color=body.color,
        default_model=body.default_model,
        default_persona_id=body.default_persona_id,
        knowledge_base_ids=body.knowledge_base_ids,
        settings=body.settings,
    )
    db.add(project)
    await db.flush()
    await db.commit()
    return _serialize_project(project)


@router.get("")
async def list_projects(
    include_archived: bool = Query(False),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Project).where(Project.user_id == user_id)
    if not include_archived:
        query = query.where(Project.archived == False)  # noqa: E712
    query = query.order_by(Project.updated_at.desc())
    result = await db.execute(query)
    projects = result.scalars().all()

    # Get conversation counts in one query
    count_q = (
        select(
            Conversation.project_id,
            func.count(Conversation.id).label("cnt"),
        )
        .where(Conversation.project_id.in_([p.id for p in projects]))
        .group_by(Conversation.project_id)
    )
    count_result = await db.execute(count_q)
    counts = {row.project_id: row.cnt for row in count_result}

    return [_serialize_project(p, counts.get(p.id, 0)) for p in projects]


@router.get("/{project_id}")
async def get_project(
    project_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == user_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    count_result = await db.execute(select(func.count(Conversation.id)).where(Conversation.project_id == project_id))
    count = count_result.scalar() or 0

    return _serialize_project(project, count)


@router.put("/{project_id}")
async def update_project(
    project_id: uuid.UUID,
    body: UpdateProjectRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == user_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if body.name is not None:
        project.name = body.name
    if body.description is not None:
        project.description = body.description
    if body.icon is not None:
        project.icon = body.icon
    if body.color is not None:
        project.color = body.color
    if body.default_model is not None:
        project.default_model = body.default_model
    if body.default_persona_id is not None:
        project.default_persona_id = body.default_persona_id
    if body.knowledge_base_ids is not None:
        project.knowledge_base_ids = body.knowledge_base_ids
    if body.pinned_conversation_ids is not None:
        project.pinned_conversation_ids = body.pinned_conversation_ids
    if body.settings is not None:
        project.settings = body.settings
    if body.archived is not None:
        project.archived = body.archived

    await db.commit()
    return _serialize_project(project)


@router.delete("/{project_id}")
async def delete_project(
    project_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == user_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Soft delete: archive the project and unlink conversations
    project.archived = True
    await db.execute(
        Conversation.__table__.update()  # type: ignore[attr-defined]
        .where(Conversation.project_id == project_id)
        .values(project_id=None)
    )
    await db.commit()
    return {"ok": True}


@router.post("/{project_id}/conversations")
async def move_conversation_to_project(
    project_id: uuid.UUID,
    body: MoveConversationRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify project ownership
    proj_result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == user_id))
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Verify conversation ownership
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == body.conversation_id, Conversation.user_id == user_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conv.project_id = project_id
    await db.commit()
    return {"ok": True, "conversation_id": str(conv.id), "project_id": str(project_id)}


@router.get("/{project_id}/conversations")
async def list_project_conversations(
    project_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify project ownership
    proj_result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == user_id))
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Count
    count_result = await db.execute(select(func.count(Conversation.id)).where(Conversation.project_id == project_id))
    total = count_result.scalar() or 0

    # Fetch page
    offset = (page - 1) * page_size
    result = await db.execute(
        select(Conversation)
        .where(Conversation.project_id == project_id)
        .order_by(Conversation.updated_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    conversations = result.scalars().all()

    return {
        "conversations": [
            {
                "id": str(c.id),
                "title": c.title,
                "model": c.model,
                "project_id": str(c.project_id) if c.project_id else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in conversations
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
