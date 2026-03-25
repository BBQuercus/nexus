"""Background job system for Nexus.

Lightweight async job queue. Uses Redis for durability when available,
falls back to in-memory for development.
"""

import asyncio
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from backend.logging_config import get_logger

logger = get_logger("jobs")


class JobStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class Job:
    id: str
    name: str
    status: JobStatus
    params: dict[str, Any]
    result: Any = None
    error: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    started_at: datetime | None = None
    completed_at: datetime | None = None
    user_id: str | None = None
    scheduled_cron: str | None = None


# Job registry
_job_handlers: dict[str, Callable] = {}
_active_jobs: dict[str, Job] = {}
_job_queue: asyncio.Queue = asyncio.Queue()


def register_job_handler(name: str):
    """Decorator to register a job handler."""
    def decorator(func):
        _job_handlers[name] = func
        return func
    return decorator


async def enqueue_job(
    name: str,
    params: dict[str, Any] | None = None,
    user_id: str | None = None,
) -> Job:
    """Enqueue a job for background execution."""
    job = Job(
        id=str(uuid.uuid4()),
        name=name,
        status=JobStatus.PENDING,
        params=params or {},
        user_id=user_id,
    )
    _active_jobs[job.id] = job
    await _job_queue.put(job)
    logger.info("job_enqueued", job_id=job.id, job_name=name)
    return job


def get_job(job_id: str) -> Job | None:
    """Get job status."""
    return _active_jobs.get(job_id)


def list_jobs(user_id: str | None = None, status: JobStatus | None = None) -> list[Job]:
    """List jobs, optionally filtered."""
    jobs = list(_active_jobs.values())
    if user_id:
        jobs = [j for j in jobs if j.user_id == user_id]
    if status:
        jobs = [j for j in jobs if j.status == status]
    return sorted(jobs, key=lambda j: j.created_at, reverse=True)


async def cancel_job(job_id: str) -> Job | None:
    """Cancel a pending job. Running jobs cannot be cancelled."""
    job = _active_jobs.get(job_id)
    if not job:
        return None
    if job.status == JobStatus.PENDING:
        job.status = JobStatus.CANCELLED
        job.completed_at = datetime.now(UTC)
        logger.info("job_cancelled", job_id=job.id, job_name=job.name)
    return job


async def _process_jobs():
    """Background worker that processes jobs from the queue."""
    while True:
        try:
            job = await _job_queue.get()
            if job.status == JobStatus.CANCELLED:
                continue

            handler = _job_handlers.get(job.name)
            if not handler:
                job.status = JobStatus.FAILED
                job.error = f"No handler registered for job: {job.name}"
                logger.error("job_no_handler", job_id=job.id, job_name=job.name)
                continue

            job.status = JobStatus.RUNNING
            job.started_at = datetime.now(UTC)
            logger.info("job_started", job_id=job.id, job_name=job.name)

            try:
                job.result = await handler(**job.params)
                job.status = JobStatus.COMPLETED
                logger.info("job_completed", job_id=job.id, job_name=job.name)
            except Exception as e:
                job.status = JobStatus.FAILED
                job.error = str(e)
                logger.error("job_failed", job_id=job.id, job_name=job.name, error=str(e))
            finally:
                job.completed_at = datetime.now(UTC)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("job_worker_error", error=str(e))


async def start_job_worker():
    """Start the background job worker. Call during app lifespan."""
    return asyncio.create_task(_process_jobs())
