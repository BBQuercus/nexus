import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_org, get_current_user, get_org_db
from backend.models import PromptTemplate
from backend.services.audit import AuditAction, record_audit_event

router = APIRouter(prefix="/api/prompt-templates", tags=["prompt-templates"])


class CreateTemplateRequest(BaseModel):
    name: str
    description: str | None = None
    template: str
    variables: list[dict] | None = None
    agent_persona_id: uuid.UUID | None = None
    is_public: bool = False


class UpdateTemplateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    template: str | None = None
    variables: list[dict] | None = None
    agent_persona_id: uuid.UUID | None = None
    is_public: bool | None = None


class RenderTemplateRequest(BaseModel):
    variables: dict[str, str]


def _serialize_template(t: PromptTemplate) -> dict:
    return {
        "id": str(t.id),
        "org_id": str(t.org_id),
        "user_id": str(t.user_id),
        "agent_persona_id": str(t.agent_persona_id) if t.agent_persona_id else None,
        "name": t.name,
        "description": t.description,
        "template": t.template,
        "variables": t.variables,
        "is_public": t.is_public,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


@router.post("")
async def create_template(
    body: CreateTemplateRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    template = PromptTemplate(
        org_id=org_id,
        user_id=user_id,
        agent_persona_id=body.agent_persona_id,
        name=body.name,
        description=body.description,
        template=body.template,
        variables=body.variables,
        is_public=body.is_public,
    )
    db.add(template)
    await db.flush()
    await db.commit()
    await record_audit_event(
        AuditAction.TEMPLATE_CREATED,
        actor_id=str(user_id),
        resource_type="prompt_template",
        resource_id=str(template.id),
    )
    return _serialize_template(template)


@router.get("")
async def list_templates(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(PromptTemplate)
        .where(
            or_(
                PromptTemplate.user_id == user_id,
                PromptTemplate.is_public == True,  # noqa: E712
            )
        )
        .order_by(PromptTemplate.created_at.desc())
    )
    templates = result.scalars().all()
    return [_serialize_template(t) for t in templates]


@router.get("/{template_id}")
async def get_template(
    template_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(select(PromptTemplate).where(PromptTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if template.user_id != user_id and not template.is_public:
        raise HTTPException(status_code=403, detail="Access denied")
    return _serialize_template(template)


@router.patch("/{template_id}")
async def update_template(
    template_id: uuid.UUID,
    body: UpdateTemplateRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(PromptTemplate).where(PromptTemplate.id == template_id, PromptTemplate.user_id == user_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found or not owned by you")

    if body.name is not None:
        template.name = body.name
    if body.description is not None:
        template.description = body.description
    if body.template is not None:
        template.template = body.template
    if body.variables is not None:
        template.variables = body.variables
    if body.agent_persona_id is not None:
        template.agent_persona_id = body.agent_persona_id
    if body.is_public is not None:
        template.is_public = body.is_public

    await db.commit()
    return _serialize_template(template)


@router.delete("/{template_id}")
async def delete_template(
    template_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(PromptTemplate).where(PromptTemplate.id == template_id, PromptTemplate.user_id == user_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found or not owned by you")

    await db.delete(template)
    await db.commit()
    await record_audit_event(
        AuditAction.TEMPLATE_DELETED,
        actor_id=str(user_id),
        resource_type="prompt_template",
        resource_id=str(template_id),
    )
    return {"ok": True}


@router.post("/{template_id}/render")
async def render_template(
    template_id: uuid.UUID,
    body: RenderTemplateRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(select(PromptTemplate).where(PromptTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if template.user_id != user_id and not template.is_public:
        raise HTTPException(status_code=403, detail="Access denied")

    rendered = re.sub(
        r"\{\{(\w+)\}\}",
        lambda m: body.variables.get(m.group(1), m.group(0)),
        template.template,
    )
    return {"rendered": rendered}
