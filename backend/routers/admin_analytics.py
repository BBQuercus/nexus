"""Admin analytics API endpoints."""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import get_db
from backend.services.rbac import Role, require_role

router = APIRouter(prefix="/api/admin/analytics", tags=["admin-analytics"])


@router.get("/usage")
async def get_usage_stats(
    user_id: uuid.UUID = Depends(require_role(Role.ADMIN)),
    db: AsyncSession = Depends(get_db),
    days: int = Query(30, le=365),
):
    """Get usage statistics. Admin only."""
    from backend.models import Conversation, Message, UsageLog, User

    since = datetime.now(UTC) - timedelta(days=days)

    # Total messages
    msg_count = await db.execute(select(func.count(Message.id)).where(Message.created_at >= since))
    total_messages = msg_count.scalar() or 0

    # Total conversations
    conv_count = await db.execute(select(func.count(Conversation.id)).where(Conversation.created_at >= since))
    total_conversations = conv_count.scalar() or 0

    # Total users
    user_count = await db.execute(select(func.count(User.id)).where(User.last_seen_at >= since))
    active_users = user_count.scalar() or 0

    # Token usage by model
    usage_by_model = await db.execute(
        select(
            UsageLog.model,
            func.sum(UsageLog.input_tokens).label("input_tokens"),
            func.sum(UsageLog.output_tokens).label("output_tokens"),
            func.sum(UsageLog.cost_usd).label("total_cost"),
            func.count(UsageLog.id).label("request_count"),
        )
        .where(UsageLog.created_at >= since)
        .group_by(UsageLog.model)
    )
    models = [
        {
            "model": row.model,
            "input_tokens": int(row.input_tokens or 0),
            "output_tokens": int(row.output_tokens or 0),
            "total_cost": float(row.total_cost or 0),
            "request_count": int(row.request_count or 0),
        }
        for row in usage_by_model
    ]

    return {
        "period_days": days,
        "total_messages": total_messages,
        "total_conversations": total_conversations,
        "active_users": active_users,
        "models": models,
    }


@router.get("/users")
async def get_user_stats(
    user_id: uuid.UUID = Depends(require_role(Role.ADMIN)),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, le=200),
):
    """Get per-user usage statistics. Admin only."""
    from backend.models import UsageLog, User

    user_stats = await db.execute(
        select(
            User.id,
            User.email,
            User.name,
            User.last_seen_at,
            func.sum(UsageLog.cost_usd).label("total_cost"),
            func.count(UsageLog.id).label("request_count"),
        )
        .outerjoin(UsageLog, User.id == UsageLog.user_id)
        .group_by(User.id, User.email, User.name, User.last_seen_at)
        .order_by(func.sum(UsageLog.cost_usd).desc().nulls_last())
        .limit(limit)
    )

    return {
        "users": [
            {
                "id": str(row.id),
                "email": row.email,
                "name": row.name,
                "last_seen": row.last_seen_at.isoformat() if row.last_seen_at else None,
                "total_cost": float(row.total_cost or 0),
                "request_count": int(row.request_count or 0),
            }
            for row in user_stats
        ],
    }
