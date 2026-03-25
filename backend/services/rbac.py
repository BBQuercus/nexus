"""Role-Based Access Control for Nexus.

Roles: viewer, editor, admin, org_admin
Permissions are checked at the router level using FastAPI dependencies.
"""

import uuid
from enum import StrEnum

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user
from backend.db import get_db
from backend.logging_config import get_logger

logger = get_logger("rbac")


class Role(StrEnum):
    VIEWER = "viewer"
    EDITOR = "editor"
    ADMIN = "admin"
    ORG_ADMIN = "org_admin"


# Permission definitions
ROLE_PERMISSIONS = {
    Role.VIEWER: {
        "conversation.read",
        "message.read",
        "artifact.read",
        "agent.read",
        "kb.read",
        "memory.read",
        "project.read",
    },
    Role.EDITOR: {
        "conversation.read",
        "conversation.create",
        "conversation.update",
        "conversation.delete",
        "message.read",
        "message.create",
        "message.delete",
        "artifact.read",
        "artifact.create",
        "artifact.delete",
        "agent.read",
        "agent.create",
        "agent.update",
        "agent.delete",
        "kb.read",
        "kb.create",
        "kb.update",
        "kb.delete",
        "kb.document.upload",
        "kb.document.delete",
        "sandbox.create",
        "sandbox.execute",
        "sandbox.delete",
        "tool.use",
        "memory.read",
        "memory.create",
        "memory.update",
        "memory.delete",
        "project.read",
        "project.create",
        "project.update",
        "project.delete",
        "search.use",
    },
    Role.ADMIN: {
        # All editor permissions plus admin-specific
        "admin.users.read",
        "admin.users.update",
        "admin.analytics.read",
        "admin.audit.read",
        "admin.settings.read",
        "admin.settings.update",
        "integration.mcp.manage",
        "integration.plugin.manage",
    },
    Role.ORG_ADMIN: {
        # All admin permissions plus org-level
        "admin.users.create",
        "admin.users.delete",
        "admin.roles.manage",
        "admin.compliance.read",
        "admin.data.export",
    },
}

# Build cumulative permissions (each role includes all lower role permissions)
for role in [Role.ADMIN, Role.ORG_ADMIN]:
    ROLE_PERMISSIONS[role] = ROLE_PERMISSIONS[role] | ROLE_PERMISSIONS[Role.EDITOR]
ROLE_PERMISSIONS[Role.ORG_ADMIN] = ROLE_PERMISSIONS[Role.ORG_ADMIN] | ROLE_PERMISSIONS[Role.ADMIN]


async def get_user_role(user_id: uuid.UUID, db: AsyncSession) -> Role:
    """Get a user's role from the database."""
    from backend.models import User

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Map existing is_admin to roles, with new role field taking precedence
    if hasattr(user, "role") and user.role:
        return Role(user.role)
    return Role.ADMIN if user.is_admin else Role.EDITOR


def has_permission(role: Role, permission: str) -> bool:
    """Check if a role has a specific permission."""
    return permission in ROLE_PERMISSIONS.get(role, set())


def require_permission(permission: str):
    """FastAPI dependency that checks a permission."""

    async def checker(
        user_id: uuid.UUID = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        role = await get_user_role(user_id, db)
        if not has_permission(role, permission):
            logger.warning("permission_denied", user_id=str(user_id), role=role.value, permission=permission)
            raise HTTPException(
                status_code=403,
                detail=f"Permission denied: {permission}",
            )
        return user_id

    return checker


def require_role(min_role: Role):
    """FastAPI dependency that requires a minimum role level."""
    role_order = [Role.VIEWER, Role.EDITOR, Role.ADMIN, Role.ORG_ADMIN]

    async def checker(
        user_id: uuid.UUID = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        role = await get_user_role(user_id, db)
        if role_order.index(role) < role_order.index(min_role):
            raise HTTPException(
                status_code=403,
                detail=f"Requires {min_role.value} role or higher",
            )
        return user_id

    return checker
