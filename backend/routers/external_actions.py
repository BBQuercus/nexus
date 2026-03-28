import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_org, get_current_user, get_org_db
from backend.models import ExternalAction
from backend.services.audit import AuditAction, record_audit_event
from backend.services.notifications import deliver_action

router = APIRouter(prefix="/api/external-actions", tags=["external-actions"])


# ── Schemas ──


class CreateActionRequest(BaseModel):
    action_type: str
    preview: dict = {}
    agent_run_id: uuid.UUID | None = None


# ── Helpers ──


def _serialize_action(a: ExternalAction) -> dict:
    return {
        "id": str(a.id),
        "org_id": str(a.org_id),
        "user_id": str(a.user_id),
        "agent_run_id": str(a.agent_run_id) if a.agent_run_id else None,
        "action_type": a.action_type,
        "status": a.status,
        "preview": a.preview,
        "result": a.result,
        "approved_by": str(a.approved_by) if a.approved_by else None,
        "approved_at": a.approved_at.isoformat() if a.approved_at else None,
        "sent_at": a.sent_at.isoformat() if a.sent_at else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


# ── Routes ──


@router.get("/history")
async def action_history(
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(ExternalAction)
        .where(ExternalAction.org_id == org_id)
        .order_by(ExternalAction.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    actions = result.scalars().all()
    return [_serialize_action(a) for a in actions]


@router.get("")
async def list_actions(
    action_type: str | None = None,
    status: str | None = None,
    agent_run_id: uuid.UUID | None = None,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    query = select(ExternalAction).where(ExternalAction.org_id == org_id)
    if action_type:
        query = query.where(ExternalAction.action_type == action_type)
    if status:
        query = query.where(ExternalAction.status == status)
    if agent_run_id:
        query = query.where(ExternalAction.agent_run_id == agent_run_id)
    query = query.order_by(ExternalAction.created_at.desc())

    result = await db.execute(query)
    actions = result.scalars().all()
    return [_serialize_action(a) for a in actions]


@router.get("/{action_id}")
async def get_action(
    action_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(ExternalAction).where(ExternalAction.id == action_id, ExternalAction.org_id == org_id)
    )
    action = result.scalar_one_or_none()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    return _serialize_action(action)


@router.post("")
async def create_action(
    body: CreateActionRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    action = ExternalAction(
        org_id=org_id,
        user_id=user_id,
        agent_run_id=body.agent_run_id,
        action_type=body.action_type,
        status="pending",
        preview=body.preview,
    )
    db.add(action)
    await db.flush()
    await db.commit()
    return _serialize_action(action)


@router.post("/{action_id}/approve")
async def approve_action(
    action_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(ExternalAction).where(ExternalAction.id == action_id, ExternalAction.org_id == org_id)
    )
    action = result.scalar_one_or_none()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    if action.status != "pending":
        raise HTTPException(status_code=400, detail=f"Action is already {action.status}")

    now = datetime.now(UTC)
    action.approved_by = user_id
    action.approved_at = now

    # Actually deliver the message
    delivery_result = await deliver_action(action.action_type, action.preview or {})

    if delivery_result.get("sent"):
        action.status = "sent"
        action.sent_at = datetime.now(UTC)
        action.result = {"message": f"{action.action_type} delivered successfully", "sent_at": action.sent_at.isoformat(), **delivery_result}
    else:
        action.status = "failed"
        action.result = {"message": f"{action.action_type} delivery failed", "error": delivery_result.get("error"), **delivery_result}

    await db.commit()
    await record_audit_event(
        AuditAction.EXTERNAL_ACTION_APPROVED,
        actor_id=str(user_id),
        resource_type="external_action",
        resource_id=str(action_id),
    )
    return _serialize_action(action)


@router.post("/{action_id}/reject")
async def reject_action(
    action_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(ExternalAction).where(ExternalAction.id == action_id, ExternalAction.org_id == org_id)
    )
    action = result.scalar_one_or_none()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    if action.status != "pending":
        raise HTTPException(status_code=400, detail=f"Action is already {action.status}")

    action.status = "rejected"
    action.approved_by = user_id
    action.approved_at = datetime.now(UTC)
    action.result = {"message": "Action rejected by user"}

    await db.commit()
    await record_audit_event(
        AuditAction.EXTERNAL_ACTION_REJECTED,
        actor_id=str(user_id),
        resource_type="external_action",
        resource_id=str(action_id),
    )
    return _serialize_action(action)
