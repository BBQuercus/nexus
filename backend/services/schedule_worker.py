"""Periodic scheduler that checks for due agent schedules and triggers runs."""

import asyncio
import contextlib
from datetime import UTC, datetime

from croniter import croniter  # type: ignore[import-untyped]
from sqlalchemy import select

from backend.db import async_session
from backend.logging_config import get_logger
from backend.models import AgentRun, AgentSchedule

logger = get_logger("schedule_worker")

POLL_INTERVAL_SECONDS = 60


def _next_run(cron_expression: str, after: datetime | None = None) -> datetime:
    """Calculate the next run time from a cron expression."""
    base = after or datetime.now(UTC)
    cron = croniter(cron_expression, base)
    next_dt: datetime = cron.get_next(datetime)
    return next_dt.replace(tzinfo=UTC)


async def _check_and_trigger():
    """Check for due schedules and create agent runs."""
    now = datetime.now(UTC)
    async with async_session() as db:
        result = await db.execute(
            select(AgentSchedule).where(
                AgentSchedule.enabled == True,  # noqa: E712
                AgentSchedule.next_run_at <= now,
            )
        )
        schedules = result.scalars().all()

        for schedule in schedules:
            try:
                # Create an agent run for this schedule
                run = AgentRun(
                    org_id=schedule.org_id,
                    user_id=schedule.user_id,
                    agent_persona_id=schedule.agent_persona_id,
                    trigger="schedule",
                    status="completed",  # Placeholder — actual execution needs agent loop integration
                    input_text=schedule.input_text or f"Scheduled run: {schedule.name}",
                    model="default",
                    total_input_tokens=0,
                    total_output_tokens=0,
                )
                db.add(run)

                # Update schedule timestamps
                schedule.last_run_at = now
                schedule.next_run_at = _next_run(schedule.cron_expression, after=now)

                logger.info(
                    "schedule_triggered",
                    schedule_id=str(schedule.id),
                    schedule_name=schedule.name,
                    next_run_at=schedule.next_run_at.isoformat(),
                )
            except Exception as e:
                logger.error("schedule_trigger_failed", schedule_id=str(schedule.id), error=str(e))

        if schedules:
            await db.commit()


async def start_schedule_worker():
    """Start the periodic schedule checker. Call during app lifespan."""

    async def _loop():
        # Initialize next_run_at for schedules that don't have it set
        try:
            async with async_session() as db:
                result = await db.execute(
                    select(AgentSchedule).where(
                        AgentSchedule.enabled == True,  # noqa: E712
                        AgentSchedule.next_run_at == None,  # noqa: E711
                    )
                )
                for schedule in result.scalars().all():
                    with contextlib.suppress(Exception):
                        schedule.next_run_at = _next_run(schedule.cron_expression)
                await db.commit()
        except Exception as e:
            logger.warning("schedule_init_failed", error=str(e))

        while True:
            try:
                await _check_and_trigger()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("schedule_worker_error", error=str(e))
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    return asyncio.create_task(_loop())
