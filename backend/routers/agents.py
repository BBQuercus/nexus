import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user
from backend.db import get_db
from backend.models import AgentPersona

router = APIRouter(prefix="/api/agents", tags=["agents"])


class CreateAgentRequest(BaseModel):
    name: str
    description: Optional[str] = None
    system_prompt: str
    default_model: Optional[str] = None
    default_mode: str = "code"
    icon: str = "\U0001f916"
    tools_enabled: Optional[list[str]] = None
    is_public: bool = False


class UpdateAgentRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    default_model: Optional[str] = None
    default_mode: Optional[str] = None
    icon: Optional[str] = None
    tools_enabled: Optional[list[str]] = None
    is_public: Optional[bool] = None


def _serialize_agent(a: AgentPersona) -> dict:
    return {
        "id": str(a.id),
        "user_id": str(a.user_id),
        "name": a.name,
        "description": a.description,
        "system_prompt": a.system_prompt,
        "default_model": a.default_model,
        "default_mode": a.default_mode,
        "icon": a.icon,
        "tools_enabled": a.tools_enabled,
        "is_public": a.is_public,
        "usage_count": a.usage_count,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }


@router.post("")
async def create_agent(
    body: CreateAgentRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    agent = AgentPersona(
        user_id=user_id,
        name=body.name,
        description=body.description,
        system_prompt=body.system_prompt,
        default_model=body.default_model,
        default_mode=body.default_mode,
        icon=body.icon,
        tools_enabled=body.tools_enabled,
        is_public=body.is_public,
    )
    db.add(agent)
    await db.flush()
    await db.commit()
    return _serialize_agent(agent)


@router.get("")
async def list_agents(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentPersona)
        .where(
            or_(
                AgentPersona.user_id == user_id,
                AgentPersona.is_public == True,  # noqa: E712
            )
        )
        .order_by(AgentPersona.created_at.desc())
    )
    agents = result.scalars().all()
    return [_serialize_agent(a) for a in agents]


@router.get("/public")
async def browse_public_agents(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentPersona)
        .where(AgentPersona.is_public == True)  # noqa: E712
        .order_by(AgentPersona.usage_count.desc())
    )
    agents = result.scalars().all()
    return [_serialize_agent(a) for a in agents]


@router.get("/{agent_id}")
async def get_agent(
    agent_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentPersona).where(AgentPersona.id == agent_id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    # Allow access if owner or public
    if agent.user_id != user_id and not agent.is_public:
        raise HTTPException(status_code=403, detail="Access denied")
    return _serialize_agent(agent)


@router.patch("/{agent_id}")
async def update_agent(
    agent_id: uuid.UUID,
    body: UpdateAgentRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentPersona).where(
            AgentPersona.id == agent_id, AgentPersona.user_id == user_id
        )
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found or not owned by you")

    if body.name is not None:
        agent.name = body.name
    if body.description is not None:
        agent.description = body.description
    if body.system_prompt is not None:
        agent.system_prompt = body.system_prompt
    if body.default_model is not None:
        agent.default_model = body.default_model
    if body.default_mode is not None:
        agent.default_mode = body.default_mode
    if body.icon is not None:
        agent.icon = body.icon
    if body.tools_enabled is not None:
        agent.tools_enabled = body.tools_enabled
    if body.is_public is not None:
        agent.is_public = body.is_public

    await db.commit()
    return _serialize_agent(agent)


@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentPersona).where(
            AgentPersona.id == agent_id, AgentPersona.user_id == user_id
        )
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found or not owned by you")

    await db.delete(agent)
    await db.commit()
    return {"ok": True}


@router.post("/{agent_id}/duplicate")
async def duplicate_agent(
    agent_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentPersona).where(AgentPersona.id == agent_id)
    )
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Agent not found")
    if not original.is_public and original.user_id != user_id:
        raise HTTPException(status_code=403, detail="Cannot duplicate private agent")

    clone = AgentPersona(
        user_id=user_id,
        name=f"{original.name} (copy)",
        description=original.description,
        system_prompt=original.system_prompt,
        default_model=original.default_model,
        default_mode=original.default_mode,
        icon=original.icon,
        tools_enabled=original.tools_enabled,
        is_public=False,
    )
    db.add(clone)

    # Increment usage count on original
    original.usage_count = (original.usage_count or 0) + 1

    await db.flush()
    await db.commit()
    return _serialize_agent(clone)
