import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.auth import get_current_org, get_current_user, get_org_db
from backend.models import AgentRun, AgentRunStep
from backend.services.audit import AuditAction, record_audit_event

router = APIRouter(prefix="/api/agent-runs", tags=["agent-runs"])


class RerunRequest(BaseModel):
    input_text: str | None = None
    input_variables: dict | None = None


def _serialize_step(s: AgentRunStep) -> dict:
    return {
        "id": str(s.id),
        "agent_run_id": str(s.agent_run_id),
        "step_index": s.step_index,
        "step_type": s.step_type,
        "tool_name": s.tool_name,
        "input_data": s.input_data,
        "output_data": s.output_data,
        "duration_ms": s.duration_ms,
        "tokens_used": s.tokens_used,
        "status": s.status,
        "error": s.error,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


def _serialize_run(r: AgentRun, include_steps: bool = False) -> dict:
    data = {
        "id": str(r.id),
        "org_id": str(r.org_id),
        "user_id": str(r.user_id),
        "agent_persona_id": str(r.agent_persona_id) if r.agent_persona_id else None,
        "conversation_id": str(r.conversation_id) if r.conversation_id else None,
        "template_id": str(r.template_id) if r.template_id else None,
        "status": r.status,
        "input_text": r.input_text,
        "input_variables": r.input_variables,
        "output_text": r.output_text,
        "model": r.model,
        "tool_calls": r.tool_calls,
        "total_input_tokens": r.total_input_tokens,
        "total_output_tokens": r.total_output_tokens,
        "cost_usd": str(r.cost_usd) if r.cost_usd is not None else None,
        "duration_ms": r.duration_ms,
        "error": r.error,
        "trigger": r.trigger,
        "parent_run_id": str(r.parent_run_id) if r.parent_run_id else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
    }
    if include_steps:
        data["steps"] = [_serialize_step(s) for s in r.steps]
    return data


@router.get("")
async def list_runs(
    agent_persona_id: uuid.UUID | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    query = select(AgentRun).where(AgentRun.user_id == user_id)
    if agent_persona_id:
        query = query.where(AgentRun.agent_persona_id == agent_persona_id)
    if status:
        query = query.where(AgentRun.status == status)
    query = query.order_by(AgentRun.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    runs = result.scalars().all()
    return [_serialize_run(r) for r in runs]


@router.get("/{run_id}")
async def get_run(
    run_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(AgentRun).where(AgentRun.id == run_id, AgentRun.user_id == user_id).options(selectinload(AgentRun.steps))
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _serialize_run(run, include_steps=True)


@router.get("/{run_id}/steps")
async def get_run_steps(
    run_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    # Verify run belongs to user
    run_result = await db.execute(select(AgentRun).where(AgentRun.id == run_id, AgentRun.user_id == user_id))
    run = run_result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    result = await db.execute(
        select(AgentRunStep).where(AgentRunStep.agent_run_id == run_id).order_by(AgentRunStep.step_index.asc())
    )
    steps = result.scalars().all()
    return [_serialize_step(s) for s in steps]


@router.post("/{run_id}/rerun")
async def rerun(
    run_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    body: RerunRequest | None = None,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(select(AgentRun).where(AgentRun.id == run_id, AgentRun.user_id == user_id))
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Run not found")

    input_text = body.input_text if body and body.input_text is not None else original.input_text
    new_run = AgentRun(
        org_id=org_id,
        user_id=user_id,
        agent_persona_id=original.agent_persona_id,
        conversation_id=original.conversation_id,
        template_id=original.template_id,
        status="running",
        input_text=input_text,
        input_variables=body.input_variables if body and body.input_variables is not None else original.input_variables,
        model=original.model,
        trigger="rerun",
        parent_run_id=original.id,
    )
    db.add(new_run)
    await db.flush()
    await db.commit()
    await record_audit_event(
        AuditAction.AGENT_RUN_CREATED, actor_id=str(user_id), resource_type="agent_run", resource_id=str(new_run.id)
    )

    if original.agent_persona_id:
        from backend.routers.agent_schedules import _execute_run
        background_tasks.add_task(_execute_run, new_run.id, original.agent_persona_id, input_text)

    return _serialize_run(new_run)


@router.delete("/{run_id}")
async def delete_run(
    run_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(select(AgentRun).where(AgentRun.id == run_id, AgentRun.user_id == user_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    await db.delete(run)
    await db.commit()
    await record_audit_event(
        AuditAction.AGENT_RUN_DELETED, actor_id=str(user_id), resource_type="agent_run", resource_id=str(run_id)
    )
    return {"ok": True}
