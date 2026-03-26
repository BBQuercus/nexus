"""Compliance and audit API endpoints."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_org_db
from backend.services.rbac import Role, require_role

router = APIRouter(prefix="/api/compliance", tags=["compliance"])


@router.get("/audit-log")
async def get_audit_log(
    user_id: uuid.UUID = Depends(require_role(Role.ADMIN)),
    db: AsyncSession = Depends(get_org_db),
    action: str | None = None,
    actor_id: str | None = None,
    resource_type: str | None = None,
    since: str | None = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
):
    """Get audit log entries. Admin only."""
    from backend.models import AuditEventLog

    query = select(AuditEventLog).order_by(AuditEventLog.timestamp.desc())

    if action:
        query = query.where(AuditEventLog.action == action)
    if actor_id:
        query = query.where(AuditEventLog.actor_id == actor_id)
    if resource_type:
        query = query.where(AuditEventLog.resource_type == resource_type)
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            query = query.where(AuditEventLog.timestamp >= since_dt)
        except ValueError:
            pass

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    events = result.scalars().all()

    return {
        "events": [
            {
                "id": e.id,
                "timestamp": e.timestamp.isoformat() if e.timestamp else None,
                "action": e.action,
                "actor_id": e.actor_id,
                "resource_type": e.resource_type,
                "resource_id": e.resource_id,
                "details": e.details,
                "ip_address": e.ip_address,
            }
            for e in events
        ],
        "offset": offset,
        "limit": limit,
    }


@router.get("/data-export")
async def export_data(
    user_id: uuid.UUID = Depends(require_role(Role.OWNER)),
    db: AsyncSession = Depends(get_org_db),
    export_format: str = Query("json", pattern="^(json|csv)$", alias="format"),
):
    """Export all data for compliance. Org admin only."""
    from backend.models import Conversation

    # Get all conversations
    result = await db.execute(select(Conversation).where(Conversation.user_id == user_id))
    conversations = result.scalars().all()

    export_data = {
        "exported_at": datetime.now(UTC).isoformat(),
        "user_id": str(user_id),
        "conversations": [
            {
                "id": str(c.id),
                "title": c.title,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in conversations
        ],
    }

    return export_data


@router.get("/retention")
async def get_retention_policy(
    user_id: uuid.UUID = Depends(require_role(Role.ADMIN)),
):
    """Get current retention policy settings."""
    return {
        "conversation_retention_days": None,  # null = no auto-delete
        "audit_log_retention_days": 365,
        "analytics_retention_days": 90,
    }
