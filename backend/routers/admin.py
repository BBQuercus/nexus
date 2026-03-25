import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user
from backend.db import get_db
from backend.logging_config import get_logger
from backend.models import (
    Conversation,
    Feedback,
    FrontendError,
    Message,
    UsageLog,
    User,
)

logger = get_logger("admin")

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ----- Admin Auth Dependency -----


async def get_admin_user(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Verify the current user is an admin. Returns the User object."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ----- Schemas -----


class UpdateUserAdminRequest(BaseModel):
    is_admin: bool


# ----- Routes -----


@router.get("/overview")
async def admin_overview(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Dashboard overview: totals, active users, error rate."""
    now = datetime.now(UTC)
    day_ago = now - timedelta(hours=24)
    week_ago = now - timedelta(days=7)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Total users
    result = await db.execute(select(func.count(User.id)))
    total_users = result.scalar() or 0

    # Active users (24h)
    result = await db.execute(
        select(func.count(User.id)).where(User.last_seen_at >= day_ago)
    )
    active_users_24h = result.scalar() or 0

    # Active users (7d)
    result = await db.execute(
        select(func.count(User.id)).where(User.last_seen_at >= week_ago)
    )
    active_users_7d = result.scalar() or 0

    # Total conversations
    result = await db.execute(select(func.count(Conversation.id)))
    total_conversations = result.scalar() or 0

    # Messages today
    result = await db.execute(
        select(func.count(Message.id)).where(Message.created_at >= today_start)
    )
    messages_today = result.scalar() or 0

    # Error rate: frontend errors today / messages today
    result = await db.execute(
        select(func.count(FrontendError.id)).where(
            FrontendError.created_at >= today_start
        )
    )
    errors_today = result.scalar() or 0
    error_rate = (errors_today / messages_today * 100) if messages_today > 0 else 0.0

    return {
        "total_users": total_users,
        "active_users_24h": active_users_24h,
        "active_users_7d": active_users_7d,
        "total_conversations": total_conversations,
        "messages_today": messages_today,
        "errors_today": errors_today,
        "error_rate": round(error_rate, 2),
    }


@router.get("/feedback")
async def admin_list_feedback(
    rating: str | None = Query(None),
    tag: str | None = Query(None),
    model: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List all feedback with pagination and filters."""
    query = select(Feedback).order_by(Feedback.created_at.desc())

    if rating:
        query = query.where(Feedback.rating == rating)
    if model:
        query = query.where(Feedback.model == model)
    if tag:
        # Filter by tag contained in the JSON array
        query = query.where(Feedback.tags.op("@>")(f'["{tag}"]'))

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    result = await db.execute(count_query)
    total = result.scalar() or 0

    # Paginate
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    fb_result = await db.execute(query)
    feedbacks: list[Any] = list(fb_result.scalars().all())

    user_ids = list({f.user_id for f in feedbacks})
    message_ids = list({f.message_id for f in feedbacks})

    user_names: dict[uuid.UUID, str] = {}
    if user_ids:
        user_result = await db.execute(
            select(User.id, User.name).where(User.id.in_(user_ids))
        )
        user_names = {user_id: name or "Unknown" for user_id, name in user_result.all()}

    message_previews: dict[uuid.UUID, str] = {}
    if message_ids:
        msg_result = await db.execute(
            select(Message.id, Message.content).where(Message.id.in_(message_ids))
        )
        message_previews = {
            message_id: (content or "")[:200]
            for message_id, content in msg_result.all()
        }

    items = []
    for f in feedbacks:
        items.append(
            {
                "id": str(f.id),
                "user_id": str(f.user_id),
                "user_name": user_names.get(f.user_id, "Unknown"),
                "message_id": str(f.message_id),
                "message_preview": message_previews.get(f.message_id, ""),
                "conversation_id": str(f.conversation_id),
                "rating": f.rating,
                "tags": f.tags,
                "comment": f.comment,
                "model": f.model,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
        )

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/feedback/stats")
async def admin_feedback_stats(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Feedback statistics: by model, common tags, rating distribution, trends."""
    now = datetime.now(UTC)
    week_ago = now - timedelta(days=7)

    # Rating distribution
    result = await db.execute(
        select(Feedback.rating, func.count(Feedback.id))
        .group_by(Feedback.rating)
    )
    rating_distribution = {row[0]: row[1] for row in result.all()}

    # Feedback by model
    result = await db.execute(
        select(Feedback.model, Feedback.rating, func.count(Feedback.id))
        .where(Feedback.model.isnot(None))
        .group_by(Feedback.model, Feedback.rating)
    )
    by_model: dict = {}
    for model_name, rating, count in result.all():
        if model_name not in by_model:
            by_model[model_name] = {"up": 0, "down": 0, "total": 0}
        by_model[model_name][rating] = count
        by_model[model_name]["total"] += count

    # Common tags (using raw SQL for JSON array unnesting)
    result = await db.execute(
        select(
            func.jsonb_array_elements_text(Feedback.tags).label("tag"),
            func.count().label("cnt"),
        )
        .where(Feedback.tags.isnot(None))
        .group_by("tag")
        .order_by(func.count().desc())
        .limit(20)
    )
    common_tags = [{"tag": row[0], "count": row[1]} for row in result.all()]

    # Trends: feedback per day for the last 7 days
    result = await db.execute(
        select(
            cast(Feedback.created_at, Date).label("day"),
            Feedback.rating,
            func.count(Feedback.id),
        )
        .where(Feedback.created_at >= week_ago)
        .group_by("day", Feedback.rating)
        .order_by("day")
    )
    trends: list[dict] = []
    trend_map: dict = {}
    for day, rating, count in result.all():
        day_str = day.isoformat()
        if day_str not in trend_map:
            trend_map[day_str] = {"date": day_str, "up": 0, "down": 0}
        trend_map[day_str][rating] = count
    trends = list(trend_map.values())

    return {
        "rating_distribution": rating_distribution,
        "by_model": by_model,
        "common_tags": common_tags,
        "trends": trends,
    }


@router.get("/usage")
async def admin_usage(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Usage analytics: messages per day, popular models, avg response time, most active users."""
    now = datetime.now(UTC)
    month_ago = now - timedelta(days=30)

    # Messages per day (last 30 days)
    result = await db.execute(
        select(
            cast(Message.created_at, Date).label("day"),
            func.count(Message.id),
        )
        .where(Message.created_at >= month_ago)
        .group_by("day")
        .order_by("day")
    )
    messages_per_day = [
        {"date": row[0].isoformat(), "count": row[1]} for row in result.all()
    ]

    # Popular models (from usage_logs last 30 days)
    result = await db.execute(
        select(UsageLog.model, func.count(UsageLog.id).label("cnt"))
        .where(UsageLog.created_at >= month_ago)
        .group_by(UsageLog.model)
        .order_by(func.count(UsageLog.id).desc())
        .limit(10)
    )
    popular_models = [
        {"model": row[0], "count": row[1]} for row in result.all()
    ]

    # Avg response time: approximate from usage_logs (output_tokens as proxy)
    # We don't have explicit response_time, so we report avg output tokens as a proxy
    result = await db.execute(
        select(func.avg(UsageLog.output_tokens)).where(
            UsageLog.created_at >= month_ago
        )
    )
    avg_output_tokens = float(result.scalar() or 0)

    # Most active users (last 30 days by usage_logs count)
    result = await db.execute(
        select(
            UsageLog.user_id,
            func.count(UsageLog.id).label("cnt"),
        )
        .where(UsageLog.created_at >= month_ago)
        .group_by(UsageLog.user_id)
        .order_by(func.count(UsageLog.id).desc())
        .limit(10)
    )
    active_user_rows = result.all()

    most_active_users = []
    for row in active_user_rows:
        user_result = await db.execute(
            select(User.name, User.email).where(User.id == row[0])
        )
        user_row = user_result.first()
        most_active_users.append(
            {
                "user_id": str(row[0]),
                "name": user_row[0] if user_row else "Unknown",
                "email": user_row[1] if user_row else "",
                "request_count": row[1],
            }
        )

    return {
        "messages_per_day": messages_per_day,
        "popular_models": popular_models,
        "avg_output_tokens": round(avg_output_tokens, 1),
        "most_active_users": most_active_users,
    }


@router.get("/users")
async def admin_list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List all users with their stats."""
    # Count total
    result = await db.execute(select(func.count(User.id)))
    total = result.scalar() or 0

    offset = (page - 1) * page_size
    user_result = await db.execute(
        select(User).order_by(User.created_at.desc()).offset(offset).limit(page_size)
    )
    users: list[Any] = list(user_result.scalars().all())

    items = []
    for u in users:
        # Conversation count
        conv_result = await db.execute(
            select(func.count(Conversation.id)).where(Conversation.user_id == u.id)
        )
        conv_count = conv_result.scalar() or 0

        # Message count (via usage_logs)
        msg_result = await db.execute(
            select(func.count(UsageLog.id)).where(UsageLog.user_id == u.id)
        )
        msg_count = msg_result.scalar() or 0

        items.append(
            {
                "id": str(u.id),
                "email": u.email,
                "name": u.name,
                "avatar_url": u.avatar_url,
                "is_admin": u.is_admin,
                "conversation_count": conv_count,
                "message_count": msg_count,
                "last_seen": u.last_seen_at.isoformat() if u.last_seen_at else None,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
        )

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.patch("/users/{user_id}")
async def admin_update_user(
    user_id: uuid.UUID,
    body: UpdateUserAdminRequest,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a user's admin status."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_admin = body.is_admin
    await db.flush()

    logger.info(
        "admin_status_updated",
        target_user_id=str(user_id),
        is_admin=body.is_admin,
        updated_by=str(admin.id),
    )

    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "is_admin": user.is_admin,
    }


@router.get("/errors")
async def admin_list_errors(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List frontend errors with pagination."""
    # Count total
    result = await db.execute(select(func.count(FrontendError.id)))
    total = result.scalar() or 0

    offset = (page - 1) * page_size
    err_result = await db.execute(
        select(FrontendError)
        .order_by(FrontendError.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    errors: list[Any] = list(err_result.scalars().all())

    items = []
    for e in errors:
        # Get user name
        user_result = await db.execute(
            select(User.name).where(User.id == e.user_id)
        )
        user_name = user_result.scalar() or "Unknown"

        items.append(
            {
                "id": str(e.id),
                "user_id": str(e.user_id),
                "user_name": user_name,
                "message": e.message,
                "stack": e.stack,
                "url": e.url,
                "user_agent": e.user_agent,
                "component": e.component,
                "request_id": e.request_id,
                "extra": e.extra,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
        )

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/models")
async def admin_model_metrics(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Per-model metrics from usage_logs."""
    result = await db.execute(
        select(
            UsageLog.model,
            func.count(UsageLog.id).label("message_count"),
            func.avg(UsageLog.input_tokens + UsageLog.output_tokens).label(
                "avg_tokens"
            ),
            func.sum(UsageLog.cost_usd).label("total_cost"),
            func.avg(UsageLog.cost_usd).label("avg_cost_per_message"),
        )
        .group_by(UsageLog.model)
        .order_by(func.count(UsageLog.id).desc())
    )
    rows = result.all()

    return [
        {
            "model": row[0],
            "message_count": row[1],
            "avg_tokens": round(float(row[2] or 0), 1),
            "total_cost": round(float(row[3] or 0), 4),
            "avg_cost_per_message": round(float(row[4] or 0), 6),
        }
        for row in rows
    ]
