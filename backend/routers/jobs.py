import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth import get_current_user
from backend.logging_config import get_logger
from backend.services.jobs import (
    JobStatus,
    cancel_job,
    get_job,
    list_jobs,
)

logger = get_logger("jobs_router")

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


# ----- Schemas -----


class JobResponse(BaseModel):
    id: str
    name: str
    status: str
    params: dict
    result: dict | None = None
    error: str | None = None
    created_at: str
    started_at: str | None = None
    completed_at: str | None = None


def _job_to_dict(job) -> dict:
    return {
        "id": job.id,
        "name": job.name,
        "status": job.status.value,
        "params": job.params,
        "result": job.result,
        "error": job.error,
        "created_at": job.created_at.isoformat(),
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


# ----- Routes -----


@router.get("")
async def list_user_jobs(
    status: str | None = None,
    user_id: uuid.UUID = Depends(get_current_user),
):
    """List jobs for the current user."""
    job_status = None
    if status:
        try:
            job_status = JobStatus(status)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}") from e

    jobs = list_jobs(user_id=str(user_id), status=job_status)
    return [_job_to_dict(j) for j in jobs]


@router.get("/{job_id}")
async def get_job_status(
    job_id: str,
    user_id: uuid.UUID = Depends(get_current_user),
):
    """Get status of a specific job."""
    job = get_job(job_id)
    if not job or job.user_id != str(user_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_dict(job)


@router.post("/{job_id}/cancel")
async def cancel_user_job(
    job_id: str,
    user_id: uuid.UUID = Depends(get_current_user),
):
    """Cancel a pending job."""
    job = get_job(job_id)
    if not job or job.user_id != str(user_id):
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status != JobStatus.PENDING:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel job with status: {job.status.value}",
        )

    updated = await cancel_job(job_id)
    return _job_to_dict(updated)
