import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_org, get_current_user, get_org_db
from backend.models import AgentPersona
from backend.services.audit import AuditAction, record_audit_event
from backend.services.rbac import require_permission

router = APIRouter(prefix="/api/agents", tags=["agents"])


class CreateAgentRequest(BaseModel):
    name: str
    description: str | None = None
    system_prompt: str
    default_model: str | None = None
    default_mode: str = "code"
    icon: str = "\U0001f916"
    tools_enabled: list[str] | None = None
    is_public: bool = False
    category: str | None = None


class UpdateAgentRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    system_prompt: str | None = None
    default_model: str | None = None
    default_mode: str | None = None
    icon: str | None = None
    tools_enabled: list[str] | None = None
    is_public: bool | None = None
    category: str | None = None


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
        "approval_config": a.approval_config,
        "input_schema": a.input_schema,
        "output_schema": a.output_schema,
        "current_version": a.current_version,
        "category": a.category,
        "installed_from_id": str(a.installed_from_id) if a.installed_from_id else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }


@router.post("")
async def create_agent(
    body: CreateAgentRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    agent = AgentPersona(
        user_id=user_id,
        org_id=org_id,
        name=body.name,
        description=body.description,
        system_prompt=body.system_prompt,
        default_model=body.default_model,
        default_mode=body.default_mode,
        icon=body.icon,
        tools_enabled=body.tools_enabled,
        is_public=body.is_public,
        category=body.category,
    )
    db.add(agent)
    await db.flush()
    await db.commit()
    await record_audit_event(
        AuditAction.AGENT_CREATED, actor_id=str(user_id), resource_type="agent", resource_id=str(agent.id)
    )
    return _serialize_agent(agent)


@router.get("")
async def list_agents(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(AgentPersona)
        .where(AgentPersona.user_id == user_id)
        .order_by(AgentPersona.created_at.desc())
    )
    agents = result.scalars().all()
    return [_serialize_agent(a) for a in agents]


@router.get("/public")
async def browse_public_agents(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
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
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(select(AgentPersona).where(AgentPersona.id == agent_id))
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
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(select(AgentPersona).where(AgentPersona.id == agent_id, AgentPersona.user_id == user_id))
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
    if body.category is not None:
        agent.category = body.category

    await db.commit()
    return _serialize_agent(agent)


@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_permission("agent.delete")),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(select(AgentPersona).where(AgentPersona.id == agent_id, AgentPersona.user_id == user_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found or not owned by you")

    await db.delete(agent)
    await db.commit()
    await record_audit_event(
        AuditAction.AGENT_DELETED, actor_id=str(user_id), resource_type="agent", resource_id=str(agent_id)
    )
    return {"ok": True}


@router.post("/{agent_id}/duplicate")
async def duplicate_agent(
    agent_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(select(AgentPersona).where(AgentPersona.id == agent_id))
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Agent not found")
    if not original.is_public and original.user_id != user_id:
        raise HTTPException(status_code=403, detail="Cannot duplicate private agent")

    clone = AgentPersona(
        user_id=user_id,
        org_id=org_id,
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
