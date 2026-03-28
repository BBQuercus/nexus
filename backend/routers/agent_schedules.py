import time
import uuid

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_org, get_current_user, get_org_db
from backend.config import settings
from backend.db import async_session
from backend.models import AgentPersona, AgentRun, AgentSchedule
from backend.routers.agent_runs import _serialize_run
from backend.services.audit import AuditAction, record_audit_event

router = APIRouter(prefix="/api/agent-schedules", tags=["agent-schedules"])


class CreateScheduleRequest(BaseModel):
    agent_persona_id: uuid.UUID
    name: str
    cron_expression: str
    input_text: str | None = None
    input_variables: dict | None = None
    template_id: uuid.UUID | None = None


class UpdateScheduleRequest(BaseModel):
    name: str | None = None
    cron_expression: str | None = None
    enabled: bool | None = None
    input_text: str | None = None
    input_variables: dict | None = None
    template_id: uuid.UUID | None = None


def _serialize_schedule(s: AgentSchedule) -> dict:
    return {
        "id": str(s.id),
        "org_id": str(s.org_id),
        "user_id": str(s.user_id),
        "agent_persona_id": str(s.agent_persona_id),
        "template_id": str(s.template_id) if s.template_id else None,
        "name": s.name,
        "cron_expression": s.cron_expression,
        "input_text": s.input_text,
        "input_variables": s.input_variables,
        "enabled": s.enabled,
        "last_run_at": s.last_run_at.isoformat() if s.last_run_at else None,
        "next_run_at": s.next_run_at.isoformat() if s.next_run_at else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


@router.post("")
async def create_schedule(
    body: CreateScheduleRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    schedule = AgentSchedule(
        org_id=org_id,
        user_id=user_id,
        agent_persona_id=body.agent_persona_id,
        template_id=body.template_id,
        name=body.name,
        cron_expression=body.cron_expression,
        input_text=body.input_text,
        input_variables=body.input_variables,
    )
    db.add(schedule)
    await db.flush()
    await db.commit()
    await record_audit_event(
        AuditAction.SCHEDULE_CREATED,
        actor_id=str(user_id),
        resource_type="agent_schedule",
        resource_id=str(schedule.id),
    )
    return _serialize_schedule(schedule)


@router.get("")
async def list_schedules(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(AgentSchedule).where(AgentSchedule.user_id == user_id).order_by(AgentSchedule.created_at.desc())
    )
    schedules = result.scalars().all()
    return [_serialize_schedule(s) for s in schedules]


@router.get("/{schedule_id}")
async def get_schedule(
    schedule_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(AgentSchedule).where(AgentSchedule.id == schedule_id, AgentSchedule.user_id == user_id)
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return _serialize_schedule(schedule)


@router.patch("/{schedule_id}")
async def update_schedule(
    schedule_id: uuid.UUID,
    body: UpdateScheduleRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(AgentSchedule).where(AgentSchedule.id == schedule_id, AgentSchedule.user_id == user_id)
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found or not owned by you")

    if body.name is not None:
        schedule.name = body.name
    if body.cron_expression is not None:
        schedule.cron_expression = body.cron_expression
    if body.enabled is not None:
        schedule.enabled = body.enabled
    if body.input_text is not None:
        schedule.input_text = body.input_text
    if body.input_variables is not None:
        schedule.input_variables = body.input_variables
    if body.template_id is not None:
        schedule.template_id = body.template_id

    await db.commit()
    return _serialize_schedule(schedule)


@router.delete("/{schedule_id}")
async def delete_schedule(
    schedule_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(AgentSchedule).where(AgentSchedule.id == schedule_id, AgentSchedule.user_id == user_id)
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found or not owned by you")

    await db.delete(schedule)
    await db.commit()
    await record_audit_event(
        AuditAction.SCHEDULE_DELETED,
        actor_id=str(user_id),
        resource_type="agent_schedule",
        resource_id=str(schedule_id),
    )
    return {"ok": True}


async def _execute_run(run_id: uuid.UUID, persona_id: uuid.UUID, input_text: str) -> None:
    """Background task: call LLM and update the run record with the result."""
    async with async_session() as db:
        # Load persona for system prompt and model
        persona_result = await db.execute(select(AgentPersona).where(AgentPersona.id == persona_id))
        persona = persona_result.scalar_one_or_none()
        system_prompt = persona.system_prompt if persona else "You are a helpful assistant."
        model = (persona.default_model if persona else None) or "gpt-4.1-nano-swc"

        run_result = await db.execute(select(AgentRun).where(AgentRun.id == run_id))
        run = run_result.scalar_one_or_none()
        if not run:
            return

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": input_text},
        ]

        t0 = time.time()
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    f"{settings.LITE_LLM_URL.rstrip('/')}/v1/chat/completions",
                    headers={"Authorization": f"Bearer {settings.LITE_LLM_API_KEY}"},
                    json={"model": model, "messages": messages, "temperature": 0.3},
                )
                resp.raise_for_status()
                data = resp.json()
            duration_ms = int((time.time() - t0) * 1000)

            output = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})
            run.status = "completed"
            run.output_text = output
            run.model = model
            run.total_input_tokens = usage.get("prompt_tokens", 0)
            run.total_output_tokens = usage.get("completion_tokens", 0)
            run.duration_ms = duration_ms
            run.completed_at = func.now()
        except Exception as e:
            run.status = "failed"
            run.error = str(e)
            run.duration_ms = int((time.time() - t0) * 1000)

        await db.commit()


@router.post("/{schedule_id}/trigger")
async def trigger_schedule(
    schedule_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(AgentSchedule).where(AgentSchedule.id == schedule_id, AgentSchedule.user_id == user_id)
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    run = AgentRun(
        org_id=org_id,
        user_id=user_id,
        agent_persona_id=schedule.agent_persona_id,
        template_id=schedule.template_id,
        status="running",
        input_text=schedule.input_text or "",
        input_variables=schedule.input_variables,
        trigger="schedule",
    )
    db.add(run)
    await db.flush()
    await db.commit()
    await record_audit_event(
        AuditAction.AGENT_RUN_CREATED, actor_id=str(user_id), resource_type="agent_run", resource_id=str(run.id)
    )

    background_tasks.add_task(_execute_run, run.id, schedule.agent_persona_id, schedule.input_text or "")

    return _serialize_run(run)
