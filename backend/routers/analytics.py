import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user
from backend.db import get_db
from backend.logging_config import get_logger
from backend.models import AnalyticsEvent, Conversation, UsageLog

logger = get_logger("analytics")

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ----- Schemas -----


class AnalyticsEventRequest(BaseModel):
    event_type: str
    event_data: dict | None = None


class AnalyticsEventResponse(BaseModel):
    id: str
    event_type: str
    created_at: str


# ----- Routes -----


@router.post("/events")
async def track_events(
    body: AnalyticsEventRequest | list[AnalyticsEventRequest],
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Track one or more analytics events. Accepts a single event or a list."""
    events = body if isinstance(body, list) else [body]
    created = []

    for event_req in events:
        event = AnalyticsEvent(
            user_id=user_id,
            event_type=event_req.event_type,
            event_data=event_req.event_data,
        )
        db.add(event)
        created.append(event)

    await db.flush()

    logger.info("analytics_events_tracked", count=len(created), user_id=str(user_id))

    return [
        {
            "id": str(e.id),
            "event_type": e.event_type,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in created
    ]


@router.get("/me")
async def my_usage_stats(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's own usage statistics."""
    now = datetime.now(UTC)
    week_ago = now - timedelta(days=7)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Conversations this week
    result = await db.execute(
        select(func.count(Conversation.id)).where(
            Conversation.user_id == user_id,
            Conversation.created_at >= week_ago,
        )
    )
    conversations_this_week = result.scalar() or 0

    # Tokens used this month
    result = await db.execute(
        select(func.coalesce(func.sum(UsageLog.input_tokens + UsageLog.output_tokens), 0)).where(
            UsageLog.user_id == user_id,
            UsageLog.created_at >= month_start,
        )
    )
    tokens_this_month = result.scalar() or 0

    # Cost this month
    result = await db.execute(
        select(func.coalesce(func.sum(UsageLog.cost_usd), 0)).where(
            UsageLog.user_id == user_id,
            UsageLog.created_at >= month_start,
        )
    )
    cost_this_month = float(result.scalar() or 0)

    # Favorite model (most used this month)
    result = await db.execute(
        select(UsageLog.model, func.count(UsageLog.id).label("cnt"))
        .where(
            UsageLog.user_id == user_id,
            UsageLog.created_at >= month_start,
        )
        .group_by(UsageLog.model)
        .order_by(func.count(UsageLog.id).desc())
        .limit(1)
    )
    row = result.first()
    favorite_model = row[0] if row else None

    return {
        "conversations_this_week": conversations_this_week,
        "tokens_this_month": tokens_this_month,
        "cost_this_month": round(cost_this_month, 4),
        "favorite_model": favorite_model,
    }
