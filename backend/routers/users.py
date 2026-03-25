import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user
from backend.db import get_db
from backend.models import UsageLog, User

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me")
async def get_me(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "avatar_url": user.avatar_url,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_seen_at": user.last_seen_at.isoformat() if user.last_seen_at else None,
    }


@router.get("/me/usage")
async def get_usage(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Usage stats for the current month."""
    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    result = await db.execute(
        select(
            func.coalesce(func.sum(UsageLog.input_tokens), 0).label("total_input_tokens"),
            func.coalesce(func.sum(UsageLog.output_tokens), 0).label("total_output_tokens"),
            func.coalesce(func.sum(UsageLog.cost_usd), 0).label("total_cost_usd"),
            func.coalesce(func.sum(UsageLog.sandbox_seconds), 0).label("total_sandbox_seconds"),
            func.count(UsageLog.id).label("request_count"),
        ).where(
            UsageLog.user_id == user_id,
            UsageLog.created_at >= month_start,
        )
    )
    row = result.one()

    return {
        "period": {
            "start": month_start.isoformat(),
            "end": now.isoformat(),
        },
        "input_tokens": int(row.total_input_tokens),
        "output_tokens": int(row.total_output_tokens),
        "total_tokens": int(row.total_input_tokens) + int(row.total_output_tokens),
        "cost_usd": float(row.total_cost_usd),
        "sandbox_seconds": int(row.total_sandbox_seconds),
        "sandbox_hours": round(int(row.total_sandbox_seconds) / 3600, 2),
        "request_count": int(row.request_count),
    }


@router.get("/me/usage/history")
async def get_usage_history(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Daily usage for the last 30 days."""
    now = datetime.now(UTC)
    thirty_days_ago = now - timedelta(days=30)

    result = await db.execute(
        select(
            func.date(UsageLog.created_at).label("date"),
            func.coalesce(func.sum(UsageLog.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(UsageLog.output_tokens), 0).label("output_tokens"),
            func.coalesce(func.sum(UsageLog.cost_usd), 0).label("cost_usd"),
            func.coalesce(func.sum(UsageLog.sandbox_seconds), 0).label("sandbox_seconds"),
            func.count(UsageLog.id).label("request_count"),
        )
        .where(
            UsageLog.user_id == user_id,
            UsageLog.created_at >= thirty_days_ago,
        )
        .group_by(func.date(UsageLog.created_at))
        .order_by(func.date(UsageLog.created_at))
    )
    rows = result.all()

    return [
        {
            "date": str(row.date),
            "input_tokens": int(row.input_tokens),
            "output_tokens": int(row.output_tokens),
            "total_tokens": int(row.input_tokens) + int(row.output_tokens),
            "cost_usd": float(row.cost_usd),
            "sandbox_seconds": int(row.sandbox_seconds),
            "request_count": int(row.request_count),
        }
        for row in rows
    ]
