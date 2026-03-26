"""Role-Based Access Control for Nexus.

Roles are per-org via the user_orgs table: viewer, editor, admin, owner.
Permissions are checked at the router level using FastAPI dependencies.
"""

import uuid
from enum import StrEnum

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_org, get_current_user
from backend.db import get_db
from backend.logging_config import get_logger

logger = get_logger("rbac")


class Role(StrEnum):
    VIEWER = "viewer"
    EDITOR = "editor"
    ADMIN = "admin"
    OWNER = "owner"


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
        "org.settings.read",
        "org.settings.update",
        "org.members.read",
        "org.members.invite",
        "org.members.update",
        "org.members.remove",
    },
    Role.OWNER: {
        # All admin permissions plus org-level ownership
        "admin.users.create",
        "admin.users.delete",
        "admin.roles.manage",
        "admin.compliance.read",
        "admin.data.export",
        "org.delete",
    },
}

# Build cumulative permissions (each role includes all lower role permissions)
for role in [Role.ADMIN, Role.OWNER]:
    ROLE_PERMISSIONS[role] = ROLE_PERMISSIONS[role] | ROLE_PERMISSIONS[Role.EDITOR]
ROLE_PERMISSIONS[Role.OWNER] = ROLE_PERMISSIONS[Role.OWNER] | ROLE_PERMISSIONS[Role.ADMIN]


async def get_user_role(user_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession) -> Role:
    """Get a user's role in the specified org."""
    from backend.models import UserOrg

    result = await db.execute(
        select(UserOrg.role).where(UserOrg.user_id == user_id, UserOrg.org_id == org_id)
    )
    role_str = result.scalar_one_or_none()
    if not role_str:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    return Role(role_str)


def has_permission(role: Role, permission: str) -> bool:
    """Check if a role has a specific permission."""
    return permission in ROLE_PERMISSIONS.get(role, set())


def require_permission(permission: str):
    """FastAPI dependency that checks a permission against the user's org role."""

    async def checker(
        user_id: uuid.UUID = Depends(get_current_user),
        org_id: uuid.UUID = Depends(get_current_org),
        db: AsyncSession = Depends(get_db),
    ):
        role = await get_user_role(user_id, org_id, db)
        if not has_permission(role, permission):
            logger.warning(
                "permission_denied", user_id=str(user_id), org_id=str(org_id), role=role.value, permission=permission
            )
            raise HTTPException(
                status_code=403,
                detail=f"Permission denied: {permission}",
            )
        return user_id

    return checker


def require_role(min_role: Role):
    """FastAPI dependency that requires a minimum role level in the current org."""
    role_order = [Role.VIEWER, Role.EDITOR, Role.ADMIN, Role.OWNER]

    async def checker(
        user_id: uuid.UUID = Depends(get_current_user),
        org_id: uuid.UUID = Depends(get_current_org),
        db: AsyncSession = Depends(get_db),
    ):
        role = await get_user_role(user_id, org_id, db)
        if role_order.index(role) < role_order.index(min_role):
            raise HTTPException(
                status_code=403,
                detail=f"Requires {min_role.value} role or higher",
            )
        return user_id

    return checker
