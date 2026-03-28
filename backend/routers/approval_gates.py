import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user, get_org_db
from backend.models import ApprovalGate
from backend.services.audit import AuditAction, record_audit_event

router = APIRouter(prefix="/api/approval-gates", tags=["approval-gates"])


class EditGateRequest(BaseModel):
    edited_arguments: dict


def _serialize_gate(g: ApprovalGate) -> dict:
    return {
        "id": str(g.id),
        "org_id": str(g.org_id),
        "agent_run_id": str(g.agent_run_id),
        "conversation_id": str(g.conversation_id),
        "tool_name": g.tool_name,
        "tool_arguments": g.tool_arguments,
        "status": g.status,
        "decided_by": str(g.decided_by) if g.decided_by else None,
        "decided_at": g.decided_at.isoformat() if g.decided_at else None,
        "edited_arguments": g.edited_arguments,
        "created_at": g.created_at.isoformat() if g.created_at else None,
    }


@router.get("")
async def list_approval_gates(
    conversation_id: uuid.UUID | None = None,
    status: str | None = None,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    query = select(ApprovalGate)
    if conversation_id:
        query = query.where(ApprovalGate.conversation_id == conversation_id)
    if status:
        query = query.where(ApprovalGate.status == status)
    query = query.order_by(ApprovalGate.created_at.desc())
    result = await db.execute(query)
    gates = result.scalars().all()
    return [_serialize_gate(g) for g in gates]


@router.get("/{gate_id}")
async def get_approval_gate(
    gate_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(select(ApprovalGate).where(ApprovalGate.id == gate_id))
    gate = result.scalar_one_or_none()
    if not gate:
        raise HTTPException(status_code=404, detail="Approval gate not found")
    return _serialize_gate(gate)


@router.post("/{gate_id}/approve")
async def approve_gate(
    gate_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(select(ApprovalGate).where(ApprovalGate.id == gate_id))
    gate = result.scalar_one_or_none()
    if not gate:
        raise HTTPException(status_code=404, detail="Approval gate not found")
    if gate.status != "pending":
        raise HTTPException(status_code=400, detail="Gate already decided")

    gate.status = "approved"
    gate.decided_by = user_id
    gate.decided_at = datetime.now(UTC)
    await db.commit()
    await record_audit_event(
        AuditAction.AGENT_APPROVAL_DECIDED,
        actor_id=str(user_id),
        resource_type="approval_gate",
        resource_id=str(gate_id),
    )
    return _serialize_gate(gate)


@router.post("/{gate_id}/reject")
async def reject_gate(
    gate_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(select(ApprovalGate).where(ApprovalGate.id == gate_id))
    gate = result.scalar_one_or_none()
    if not gate:
        raise HTTPException(status_code=404, detail="Approval gate not found")
    if gate.status != "pending":
        raise HTTPException(status_code=400, detail="Gate already decided")

    gate.status = "rejected"
    gate.decided_by = user_id
    gate.decided_at = datetime.now(UTC)
    await db.commit()
    await record_audit_event(
        AuditAction.AGENT_APPROVAL_DECIDED,
        actor_id=str(user_id),
        resource_type="approval_gate",
        resource_id=str(gate_id),
    )
    return _serialize_gate(gate)


@router.post("/{gate_id}/edit")
async def edit_gate(
    gate_id: uuid.UUID,
    body: EditGateRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(select(ApprovalGate).where(ApprovalGate.id == gate_id))
    gate = result.scalar_one_or_none()
    if not gate:
        raise HTTPException(status_code=404, detail="Approval gate not found")
    if gate.status != "pending":
        raise HTTPException(status_code=400, detail="Gate already decided")

    gate.status = "edited"
    gate.decided_by = user_id
    gate.decided_at = datetime.now(UTC)
    gate.edited_arguments = body.edited_arguments
    await db.commit()
    await record_audit_event(
        AuditAction.AGENT_APPROVAL_DECIDED,
        actor_id=str(user_id),
        resource_type="approval_gate",
        resource_id=str(gate_id),
    )
    return _serialize_gate(gate)
