import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user
from backend.db import get_db
from backend.logging_config import get_logger
from backend.models import Organization, UserOrg
from backend.services.audit import AuditAction, record_audit_event
from backend.services.rbac import Role, get_user_role

router = APIRouter(prefix="/api/orgs", tags=["organizations"])
logger = get_logger("routers.orgs")


# ----- Schemas -----


class CreateOrgRequest(BaseModel):
    name: str
    slug: str | None = None


class UpdateOrgRequest(BaseModel):
    name: str | None = None
    slug: str | None = None
    system_prompt: str | None = None
    settings: dict | None = None


class InviteMemberRequest(BaseModel):
    email: str
    role: str = "editor"


class UpdateMemberRequest(BaseModel):
    role: str


# ----- Helpers -----


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:100]


def _serialize_org(org: Organization, member_count: int = 0) -> dict:
    return {
        "id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "systemPrompt": org.system_prompt,
        "settings": org.settings or {},
        "memberCount": member_count,
        "createdAt": org.created_at.isoformat() if org.created_at else None,
        "updatedAt": org.updated_at.isoformat() if org.updated_at else None,
    }


# ----- Organization CRUD -----


@router.post("")
async def create_org(
    body: CreateOrgRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new organization. The creator becomes owner."""
    slug = body.slug or _slugify(body.name)
    if not slug:
        raise HTTPException(status_code=400, detail="Invalid organization name")

    # Check slug uniqueness
    existing = await db.execute(select(Organization.id).where(Organization.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="An organization with this slug already exists")

    org = Organization(name=body.name, slug=slug)
    db.add(org)
    await db.flush()

    membership = UserOrg(user_id=user_id, org_id=org.id, role="owner")
    db.add(membership)
    await db.flush()

    await record_audit_event(
        AuditAction.SETTINGS_CHANGED,
        actor_id=str(user_id),
        resource_type="organization",
        resource_id=str(org.id),
        details={"action": "org_created", "name": org.name, "slug": org.slug},
    )
    logger.info("org_created", org_id=str(org.id), name=org.name, creator=str(user_id))
    return _serialize_org(org, member_count=1)


@router.get("")
async def list_orgs(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List organizations the current user belongs to."""
    result = await db.execute(
        select(Organization, UserOrg.role)
        .join(UserOrg, UserOrg.org_id == Organization.id)
        .where(UserOrg.user_id == user_id)
        .order_by(UserOrg.joined_at)
    )
    orgs = []
    for org, role in result.all():
        count_result = await db.execute(select(func.count()).where(UserOrg.org_id == org.id))
        member_count = count_result.scalar() or 0
        data = _serialize_org(org, member_count=member_count)
        data["role"] = role
        orgs.append(data)
    return orgs


@router.get("/{org_id}")
async def get_org(
    org_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get organization details. Must be a member."""
    # Verify membership
    membership = await db.execute(
        select(UserOrg).where(UserOrg.user_id == user_id, UserOrg.org_id == org_id)
    )
    if not membership.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this organization")

    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    count_result = await db.execute(select(func.count()).where(UserOrg.org_id == org_id))
    member_count = count_result.scalar() or 0
    return _serialize_org(org, member_count=member_count)


@router.patch("/{org_id}")
async def update_org(
    org_id: uuid.UUID,
    body: UpdateOrgRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update organization. Requires admin or owner role."""
    role = await get_user_role(user_id, org_id, db)
    if role not in (Role.ADMIN, Role.OWNER):
        raise HTTPException(status_code=403, detail="Requires admin or owner role")

    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if body.name is not None:
        org.name = body.name
    if body.slug is not None:
        # Check uniqueness
        existing = await db.execute(
            select(Organization.id).where(Organization.slug == body.slug, Organization.id != org_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Slug already in use")
        org.slug = body.slug
    if body.system_prompt is not None:
        org.system_prompt = body.system_prompt
    if body.settings is not None:
        org.settings = body.settings

    await db.flush()
    logger.info("org_updated", org_id=str(org_id), user_id=str(user_id))
    return _serialize_org(org)


@router.delete("/{org_id}")
async def delete_org(
    org_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete organization. Owner only."""
    role = await get_user_role(user_id, org_id, db)
    if role != Role.OWNER:
        raise HTTPException(status_code=403, detail="Only the owner can delete an organization")

    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    await db.delete(org)
    await db.flush()
    logger.info("org_deleted", org_id=str(org_id), user_id=str(user_id))
    return {"ok": True}


# ----- Member Management -----


@router.get("/{org_id}/members")
async def list_members(
    org_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List organization members. Must be a member."""
    from backend.models import User

    # Verify caller is a member
    caller_membership = await db.execute(
        select(UserOrg).where(UserOrg.user_id == user_id, UserOrg.org_id == org_id)
    )
    if not caller_membership.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this organization")

    result = await db.execute(
        select(User, UserOrg)
        .join(UserOrg, UserOrg.user_id == User.id)
        .where(UserOrg.org_id == org_id)
        .order_by(UserOrg.joined_at)
    )
    members = []
    for user, user_org in result.all():
        members.append({
            "userId": str(user.id),
            "email": user.email,
            "name": user.name,
            "avatarUrl": user.avatar_url,
            "role": user_org.role,
            "joinedAt": user_org.joined_at.isoformat() if user_org.joined_at else None,
        })
    return members


@router.post("/{org_id}/members")
async def invite_member(
    org_id: uuid.UUID,
    body: InviteMemberRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Invite a user to the org by email. Requires admin or owner."""
    from backend.models import User

    role = await get_user_role(user_id, org_id, db)
    if role not in (Role.ADMIN, Role.OWNER):
        raise HTTPException(status_code=403, detail="Requires admin or owner role")

    if body.role not in ("viewer", "editor", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role. Must be viewer, editor, or admin")

    # Only owner can invite admins
    if body.role == "admin" and role != Role.OWNER:
        raise HTTPException(status_code=403, detail="Only owner can invite admins")

    # Find user by email
    result = await db.execute(select(User).where(User.email == body.email))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if already a member
    existing = await db.execute(
        select(UserOrg).where(UserOrg.user_id == target_user.id, UserOrg.org_id == org_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User is already a member")

    membership = UserOrg(user_id=target_user.id, org_id=org_id, role=body.role)
    db.add(membership)
    await db.flush()

    await record_audit_event(
        AuditAction.SETTINGS_CHANGED,
        actor_id=str(user_id),
        resource_type="user_org",
        resource_id=str(target_user.id),
        details={"action": "member_invited", "org_id": str(org_id), "email": body.email, "role": body.role},
    )
    logger.info("member_invited", org_id=str(org_id), target_user=str(target_user.id), role=body.role)
    return {"ok": True, "userId": str(target_user.id)}


@router.patch("/{org_id}/members/{member_id}")
async def update_member_role(
    org_id: uuid.UUID,
    member_id: uuid.UUID,
    body: UpdateMemberRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change a member's role. Requires admin or owner."""
    caller_role = await get_user_role(user_id, org_id, db)
    if caller_role not in (Role.ADMIN, Role.OWNER):
        raise HTTPException(status_code=403, detail="Requires admin or owner role")

    if body.role not in ("viewer", "editor", "admin", "owner"):
        raise HTTPException(status_code=400, detail="Invalid role")

    # Only owner can promote to admin/owner
    if body.role in ("admin", "owner") and caller_role != Role.OWNER:
        raise HTTPException(status_code=403, detail="Only owner can promote to admin or owner")

    # Can't change own role
    if member_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    result = await db.execute(
        select(UserOrg).where(UserOrg.user_id == member_id, UserOrg.org_id == org_id)
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Member not found")

    # Can't demote another owner unless you're also owner
    if membership.role == "owner" and caller_role != Role.OWNER:
        raise HTTPException(status_code=403, detail="Cannot modify owner role")

    old_role = membership.role
    membership.role = body.role
    await db.flush()

    await record_audit_event(
        AuditAction.SETTINGS_CHANGED,
        actor_id=str(user_id),
        resource_type="user_org",
        resource_id=str(member_id),
        details={"action": "member_role_changed", "org_id": str(org_id), "old_role": old_role, "new_role": body.role},
    )
    logger.info("member_role_changed", org_id=str(org_id), member=str(member_id), old=old_role, new=body.role)
    return {"ok": True}


@router.delete("/{org_id}/members/{member_id}")
async def remove_member(
    org_id: uuid.UUID,
    member_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a member from the org. Admin/owner, or self-leave."""
    is_self = member_id == user_id

    if not is_self:
        caller_role = await get_user_role(user_id, org_id, db)
        if caller_role not in (Role.ADMIN, Role.OWNER):
            raise HTTPException(status_code=403, detail="Requires admin or owner role")

    result = await db.execute(
        select(UserOrg).where(UserOrg.user_id == member_id, UserOrg.org_id == org_id)
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Member not found")

    # Owner can't leave unless they transfer ownership first
    if membership.role == "owner" and is_self:
        raise HTTPException(status_code=400, detail="Owner must transfer ownership before leaving")

    # Non-owner can't remove owner
    if membership.role == "owner" and not is_self:
        caller_role = await get_user_role(user_id, org_id, db)
        if caller_role != Role.OWNER:
            raise HTTPException(status_code=403, detail="Cannot remove the owner")

    await db.execute(delete(UserOrg).where(UserOrg.id == membership.id))
    await db.flush()

    await record_audit_event(
        AuditAction.SETTINGS_CHANGED,
        actor_id=str(user_id),
        resource_type="user_org",
        resource_id=str(member_id),
        details={"action": "member_removed", "org_id": str(org_id), "self_leave": is_self},
    )
    logger.info("member_removed", org_id=str(org_id), member=str(member_id), self_leave=is_self)
    return {"ok": True}
