"""Background job system for Nexus.

Uses Redis for durable job state and queueing when available and falls back
to in-memory execution for local development.
"""

import asyncio
import json
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from backend.logging_config import get_logger
from backend.redis import get_redis

logger = get_logger("jobs")

JOB_DATA_PREFIX = "nexus:jobs:data:"
JOB_INDEX_KEY = "nexus:jobs:index"
JOB_QUEUE_KEY = "nexus:jobs:queue"
JOB_SCAN_PATTERN = f"{JOB_DATA_PREFIX}*"
QUEUE_BLOCK_TIMEOUT_SECONDS = 5
_UNSET = object()


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


def _job_key(job_id: str) -> str:
    return f"{JOB_DATA_PREFIX}{job_id}"


def _serialize_job(job: Job) -> str:
    return json.dumps(
        {
            "id": job.id,
            "name": job.name,
            "status": job.status.value,
            "params": job.params,
            "result": job.result,
            "error": job.error,
            "created_at": job.created_at.isoformat(),
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            "user_id": job.user_id,
            "scheduled_cron": job.scheduled_cron,
        }
    )


def _deserialize_job(payload: str) -> Job:
    raw = json.loads(payload)
    return Job(
        id=raw["id"],
        name=raw["name"],
        status=JobStatus(raw["status"]),
        params=raw.get("params") or {},
        result=raw.get("result"),
        error=raw.get("error"),
        created_at=datetime.fromisoformat(raw["created_at"]),
        started_at=datetime.fromisoformat(raw["started_at"]) if raw.get("started_at") else None,
        completed_at=datetime.fromisoformat(raw["completed_at"]) if raw.get("completed_at") else None,
        user_id=raw.get("user_id"),
        scheduled_cron=raw.get("scheduled_cron"),
    )


async def _persist_job(job: Job):
    _active_jobs[job.id] = job
    r = await get_redis()
    if not r:
        return
    await r.set(_job_key(job.id), _serialize_job(job))
    await r.zadd(JOB_INDEX_KEY, {job.id: job.created_at.timestamp()})


async def _get_job_from_redis(job_id: str) -> Job | None:
    r = await get_redis()
    if not r:
        return None
    payload = await r.get(_job_key(job_id))
    if not payload:
        return None
    job = _deserialize_job(payload)
    _active_jobs[job.id] = job
    return job


async def _list_jobs_from_redis(user_id: str | None = None, status: JobStatus | None = None) -> list[Job]:
    r = await get_redis()
    if not r:
        return []

    jobs: list[Job] = []
    async for key in r.scan_iter(JOB_SCAN_PATTERN):
        payload = await r.get(key)
        if not payload:
            continue
        job = _deserialize_job(payload)
        if user_id and job.user_id != user_id:
            continue
        if status and job.status != status:
            continue
        jobs.append(job)
        _active_jobs[job.id] = job

    return sorted(jobs, key=lambda j: j.created_at, reverse=True)


async def _update_job(job: Job, *, status: JobStatus, error: str | None | object = _UNSET, result: Any = _UNSET):
    job.status = status
    if status == JobStatus.RUNNING:
        job.started_at = datetime.now(UTC)
    if status in {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED}:
        job.completed_at = datetime.now(UTC)
    if error is not _UNSET:
        job.error = str(error) if error is not None else None
    if result is not _UNSET:
        job.result = result
    await _persist_job(job)


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
    await _persist_job(job)
    r = await get_redis()
    if r:
        await r.rpush(JOB_QUEUE_KEY, job.id)  # type: ignore[misc]
    else:
        await _job_queue.put(job)
    logger.info("job_enqueued", job_id=job.id, job_name=name)
    return job


async def get_job(job_id: str) -> Job | None:
    """Get job status."""
    job = _active_jobs.get(job_id)
    if job:
        return job
    return await _get_job_from_redis(job_id)


async def list_jobs(user_id: str | None = None, status: JobStatus | None = None) -> list[Job]:
    """List jobs, optionally filtered."""
    redis_jobs = await _list_jobs_from_redis(user_id=user_id, status=status)
    if redis_jobs:
        return redis_jobs

    jobs = list(_active_jobs.values())
    if user_id:
        jobs = [j for j in jobs if j.user_id == user_id]
    if status:
        jobs = [j for j in jobs if j.status == status]
    return sorted(jobs, key=lambda j: j.created_at, reverse=True)


async def cancel_job(job_id: str) -> Job | None:
    """Cancel a pending job. Running jobs cannot be cancelled."""
    job = await get_job(job_id)
    if not job:
        return None
    if job.status == JobStatus.PENDING:
        await _update_job(job, status=JobStatus.CANCELLED)
        logger.info("job_cancelled", job_id=job.id, job_name=job.name)
    return job


async def _dequeue_job() -> Job:
    r = await get_redis()
    if r:
        result = await r.blpop(JOB_QUEUE_KEY, timeout=QUEUE_BLOCK_TIMEOUT_SECONDS)  # type: ignore[misc]
        if result is None:
            raise TimeoutError("No queued job available")
        _, job_id = result
        job = await _get_job_from_redis(job_id)
        if not job:
            raise RuntimeError(f"Job metadata missing for queued job {job_id}")
        return job

    return await asyncio.wait_for(_job_queue.get(), timeout=QUEUE_BLOCK_TIMEOUT_SECONDS)


async def _process_jobs():
    """Background worker that processes jobs from the queue."""
    backoff = 0
    while True:
        try:
            if backoff > 0:
                await asyncio.sleep(backoff)

            job = await _dequeue_job()
            backoff = 0  # Reset on successful dequeue

            if job.status == JobStatus.CANCELLED:
                continue

            handler = _job_handlers.get(job.name)
            if not handler:
                await _update_job(job, status=JobStatus.FAILED, error=f"No handler registered for job: {job.name}")
                logger.error("job_no_handler", job_id=job.id, job_name=job.name)
                continue

            await _update_job(job, status=JobStatus.RUNNING, error=None)
            logger.info("job_started", job_id=job.id, job_name=job.name)

            try:
                result = await handler(**job.params)
                await _update_job(job, status=JobStatus.COMPLETED, result=result, error=None)
                logger.info("job_completed", job_id=job.id, job_name=job.name)
            except Exception as e:
                await _update_job(job, status=JobStatus.FAILED, error=str(e))
                logger.error("job_failed", job_id=job.id, job_name=job.name, error=str(e))
        except TimeoutError:
            backoff = 0
            continue
        except asyncio.CancelledError:
            break
        except Exception as e:
            # Connection errors (Redis down, etc.) — back off to avoid tight loop
            backoff = min(backoff + 5, 30)
            logger.error("job_worker_error", error=str(e), retry_in=backoff)


async def start_job_worker():
    """Start the background job worker. Call during app lifespan."""
    return asyncio.create_task(_process_jobs())
