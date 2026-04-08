"""Audit event system for Nexus.

Provides an append-only audit trail for sensitive actions.
Events are stored in the database and are immutable once created.
"""

import json
import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel

from backend.logging_config import get_logger

logger = get_logger("audit")


class AuditAction(StrEnum):
    """Auditable actions in the system."""

    # Auth
    USER_LOGIN = "user.login"
    USER_LOGOUT = "user.logout"
    USER_CREATED = "user.created"
    USER_ROLE_CHANGED = "user.role_changed"

    # Conversations
    CONVERSATION_CREATED = "conversation.created"
    CONVERSATION_DELETED = "conversation.deleted"
    CONVERSATION_SHARED = "conversation.shared"
    CONVERSATION_EXPORTED = "conversation.exported"

    # Messages
    MESSAGE_SENT = "message.sent"
    MESSAGE_DELETED = "message.deleted"
    MESSAGE_EDITED = "message.edited"

    # Agents
    AGENT_CREATED = "agent.created"
    AGENT_UPDATED = "agent.updated"
    AGENT_DELETED = "agent.deleted"
    AGENT_PUBLISHED = "agent.published"

    # Agent runs
    AGENT_RUN_CREATED = "agent_run.created"
    AGENT_RUN_DELETED = "agent_run.deleted"

    # Agent schedules
    SCHEDULE_CREATED = "schedule.created"
    SCHEDULE_DELETED = "schedule.deleted"

    # Approval gates
    AGENT_APPROVAL_DECIDED = "agent_approval.decided"

    # Prompt templates
    TEMPLATE_CREATED = "template.created"
    TEMPLATE_DELETED = "template.deleted"

    # External actions
    EXTERNAL_ACTION_APPROVED = "external_action.approved"
    EXTERNAL_ACTION_REJECTED = "external_action.rejected"

    # Marketplace
    MARKETPLACE_PUBLISHED = "marketplace.published"
    MARKETPLACE_INSTALLED = "marketplace.installed"

    # Knowledge bases
    KB_CREATED = "kb.created"
    KB_DELETED = "kb.deleted"
    KB_DOCUMENT_UPLOADED = "kb.document_uploaded"
    KB_DOCUMENT_DELETED = "kb.document_deleted"

    # Sandbox
    SANDBOX_CREATED = "sandbox.created"
    SANDBOX_CODE_EXECUTED = "sandbox.code_executed"
    SANDBOX_DELETED = "sandbox.deleted"

    # Tools
    TOOL_EXTERNAL_API_CALLED = "tool.external_api_called"
    TOOL_WEB_BROWSED = "tool.web_browsed"

    # Admin
    ADMIN_SETTING_CHANGED = "admin.setting_changed"
    ADMIN_USER_MODIFIED = "admin.user_modified"
    ADMIN_DATA_EXPORTED = "admin.data_exported"

    # Security
    SECURITY_AUTH_FAILED = "security.auth_failed"
    SECURITY_RATE_LIMITED = "security.rate_limited"
    SECURITY_SSRF_BLOCKED = "security.ssrf_blocked"

    # Organizations
    ORG_CREATED = "org.created"
    ORG_UPDATED = "org.updated"
    ORG_DELETED = "org.deleted"
    MEMBER_INVITED = "org.member_invited"
    MEMBER_REMOVED = "org.member_removed"
    MEMBER_ROLE_CHANGED = "org.member_role_changed"
    ORG_SWITCHED = "org.switched"

    # Settings (generic)
    SETTINGS_CHANGED = "settings.changed"


class AuditEvent(BaseModel):
    """An immutable audit event."""

    id: str
    timestamp: datetime
    action: AuditAction
    actor_id: str | None = None  # User who performed the action
    actor_email: str | None = None  # For human-readable logs
    org_id: str | None = None  # Organization context
    resource_type: str | None = None  # What was acted on (conversation, agent, etc.)
    resource_id: str | None = None  # ID of the resource
    details: dict[str, Any] = {}  # Action-specific details
    ip_address: str | None = None
    user_agent: str | None = None
    request_id: str | None = None

    class Config:
        extra = "forbid"  # Strict — no extra fields allowed


# In-memory buffer for batch writes (flushed periodically or on threshold)
_audit_buffer: list[AuditEvent] = []
_BUFFER_FLUSH_THRESHOLD = 50


async def record_audit_event(
    action: AuditAction,
    actor_id: str | None = None,
    org_id: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    request_id: str | None = None,
):
    """Record an audit event. Events are buffered and flushed to the database."""
    event = AuditEvent(
        id=str(uuid.uuid4()),
        timestamp=datetime.now(UTC),
        action=action,
        actor_id=actor_id,
        org_id=org_id,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details or {},
        ip_address=ip_address,
        user_agent=user_agent,
        request_id=request_id,
    )

    # Always log immediately
    logger.info(
        "audit_event",
        action=action.value,
        actor_id=actor_id,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
    )

    _audit_buffer.append(event)

    # Flush immediately to avoid losing events on crash
    await flush_audit_buffer()


async def flush_audit_buffer():
    """Flush buffered audit events to the database."""
    if not _audit_buffer:
        return

    events_to_flush = _audit_buffer.copy()
    _audit_buffer.clear()

    try:
        from sqlalchemy import text

        from backend.db import async_session

        async with async_session() as session:
            for event in events_to_flush:
                await session.execute(
                    text("""
                        INSERT INTO audit_events (id, org_id, timestamp, action, actor_id, resource_type, resource_id, details, ip_address, user_agent, request_id)
                        VALUES (:id, :org_id, :timestamp, :action, :actor_id, :resource_type, :resource_id, :details, :ip_address, :user_agent, :request_id)
                    """),
                    {
                        "id": event.id,
                        "org_id": event.org_id,
                        "timestamp": event.timestamp,
                        "action": event.action.value,
                        "actor_id": event.actor_id,
                        "resource_type": event.resource_type,
                        "resource_id": event.resource_id,
                        "details": json.dumps(event.details),
                        "ip_address": event.ip_address,
                        "user_agent": event.user_agent,
                        "request_id": event.request_id,
                    },
                )
            await session.commit()
            logger.info("audit_buffer_flushed", count=len(events_to_flush))
    except Exception as e:
        logger.error("audit_flush_failed", error=str(e), lost_events=len(events_to_flush))
        # Re-add events to buffer on failure
        _audit_buffer.extend(events_to_flush)
