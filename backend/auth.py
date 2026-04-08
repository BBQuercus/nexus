import hashlib
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db import async_session, get_db, get_org_scoped_db
from backend.logging_config import get_logger
from backend.models import Organization, User, UserOrg
from backend.services.audit import AuditAction, record_audit_event

logger = get_logger("auth")

_workos_client = None


def _get_workos_client():
    global _workos_client
    if _workos_client is None:
        if not settings.WORKOS_API_KEY or not settings.WORKOS_CLIENT_ID:
            raise HTTPException(status_code=503, detail="Authentication service is not configured")
        import workos

        _workos_client = workos.WorkOSClient(
            api_key=settings.WORKOS_API_KEY,
            client_id=settings.WORKOS_CLIENT_ID,
        )
    return _workos_client


router = APIRouter(prefix="/auth", tags=["auth"])


def _get_frontend_url() -> str:
    """Get the frontend URL for redirects."""
    return settings.FRONTEND_URL


def _set_auth_cookie(response: Response, key: str, value: str, max_age: int) -> None:
    response.set_cookie(
        key,
        value,
        httponly=True,
        samesite=settings.COOKIE_SAMESITE,  # type: ignore[arg-type]
        secure=settings.cookie_secure,
        max_age=max_age,
        domain=settings.cookie_domain,
    )


def _set_csrf_cookie(response: Response, value: str, max_age: int) -> None:
    response.set_cookie(
        "csrf_token",
        value,
        httponly=False,
        samesite=settings.COOKIE_SAMESITE,  # type: ignore[arg-type]
        secure=settings.cookie_secure,
        max_age=max_age,
        domain=settings.cookie_domain,
    )


def get_auth_url(provider: str | None = None) -> str:
    """Returns WorkOS authorization URL for the given provider."""
    client = _get_workos_client()

    if provider == "microsoft" and settings.WORKOS_ORG_ID:
        # Microsoft uses SSO via WorkOS Organization (Entra ID OIDC)
        return client.user_management.get_authorization_url(  # type: ignore[no-any-return]
            redirect_uri=settings.WORKOS_REDIRECT_URI,
            organization_id=settings.WORKOS_ORG_ID,
        )

    if provider == "github":
        return client.user_management.get_authorization_url(  # type: ignore[no-any-return]
            redirect_uri=settings.WORKOS_REDIRECT_URI,
            provider="GitHubOAuth",
        )

    # Fallback to AuthKit hosted login
    return client.user_management.get_authorization_url(  # type: ignore[no-any-return]
        redirect_uri=settings.WORKOS_REDIRECT_URI,
        provider="authkit",
    )


def exchange_code(code: str):
    """Exchanges auth code for user profile via WorkOS."""
    client = _get_workos_client()
    return client.user_management.authenticate_with_code(code=code)


def create_access_token(user_id: str, email: str, org_id: str | None = None) -> str:
    """Creates a short-lived JWT access token (1 hour)."""
    now = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_MINUTES),
        "iat": now,
    }
    if org_id:
        payload["org_id"] = org_id
    return jwt.encode(payload, settings.SERVER_SECRET, algorithm=settings.JWT_ENCODING_ALGORITHM)


def create_refresh_token(user_id: str, email: str) -> str:
    """Creates a long-lived JWT refresh token (7 days)."""
    now = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "email": email,
        "type": "refresh",
        "exp": now + timedelta(days=settings.JWT_REFRESH_TOKEN_DAYS),
        "iat": now,
    }
    return jwt.encode(payload, settings.SERVER_SECRET, algorithm=settings.JWT_ENCODING_ALGORITHM)


def generate_csrf_token(session_id: str, iat: str | int = "", org_id: str = "") -> str:
    """Generate a CSRF token tied to the user's session, token issue time, and org.

    Including ``iat`` ensures the CSRF token rotates whenever the JWT is
    refreshed, preventing replay of leaked tokens across sessions.
    Including ``org_id`` binds the token to the active org context.
    """
    raw = f"{session_id}:{iat}:{org_id}:{settings.SERVER_SECRET}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _get_claims_from_session_cookie(request: Request) -> dict | None:
    """Decode the session JWT and return the full claims dict, or None."""
    token = request.cookies.get("session")
    if not token:
        return None

    try:
        payload = jwt.decode(
            token,
            settings.SERVER_SECRET,
            algorithms=[settings.JWT_ENCODING_ALGORITHM],
        )
    except (jwt.InvalidTokenError, ValueError):
        return None

    if payload.get("type", "access") != "access":
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    try:
        uuid.UUID(user_id)
    except ValueError:
        return None

    return payload


def _get_user_id_from_session_cookie(request: Request) -> uuid.UUID | None:
    claims = _get_claims_from_session_cookie(request)
    if claims is None:
        return None
    try:
        return uuid.UUID(claims["sub"])
    except (KeyError, ValueError):
        return None


def _get_admin_api_user_id(token: str | None) -> uuid.UUID | None:
    configured_token = (settings.ADMIN_API_TOKEN or "").strip()
    configured_user_id = (settings.ADMIN_API_USER_ID or "").strip()
    if not token or not configured_token or token != configured_token:
        return None
    if not configured_user_id:
        logger.warning("admin_api_token_missing_user_id")
        return None
    try:
        return uuid.UUID(configured_user_id)
    except ValueError:
        logger.warning("admin_api_user_id_invalid", admin_api_user_id=configured_user_id)
        return None


async def get_current_user(request: Request) -> uuid.UUID:
    """FastAPI dependency: extracts JWT from Authorization header or session cookie."""
    token = None
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        admin_user_id = _get_admin_api_user_id(token)
        if admin_user_id is not None:
            return admin_user_id
    if not token:
        token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(
            token,
            settings.SERVER_SECRET,
            algorithms=[settings.JWT_ENCODING_ALGORITHM],
        )
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")

        token_type = payload.get("type", "access")
        if token_type != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")

        return uuid.UUID(user_id)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired") from None
    except (jwt.InvalidTokenError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token") from None


# ── Org Context Dependencies ──


async def get_current_org(request: Request) -> uuid.UUID:
    """Extract org_id from JWT claims. Used as a FastAPI dependency.

    Falls back to looking up the user's default org if the JWT lacks org_id
    (e.g. tokens issued before multi-org was deployed).
    """
    claims = _get_claims_from_session_cookie(request)
    if claims is None:
        # Try Bearer token path for admin API
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            admin_user_id = _get_admin_api_user_id(token)
            if admin_user_id is not None:
                # Admin API doesn't have org context — try to get from query param
                org_id_param = request.query_params.get("org_id")
                if org_id_param:
                    return uuid.UUID(org_id_param)
                raise HTTPException(status_code=400, detail="Admin API requires org_id query parameter")
        raise HTTPException(status_code=401, detail="Not authenticated")

    org_id = claims.get("org_id")
    if org_id:
        try:
            return uuid.UUID(org_id)
        except ValueError:
            raise HTTPException(status_code=401, detail="Invalid organization context") from None

    # Fallback: JWT has no org_id (pre-multi-org token). Look up or bootstrap the user's org.
    user_id_str = claims.get("sub")
    if user_id_str:
        try:
            uid = uuid.UUID(user_id_str)
            async with async_session() as db:
                result = await db.execute(
                    select(UserOrg.org_id).where(UserOrg.user_id == uid).order_by(UserOrg.joined_at).limit(1)
                )
                found = result.scalar_one_or_none()
                if found:
                    return found

                # No membership at all — auto-create a personal org for this existing user
                import re as _re

                user_result = await db.execute(select(User).where(User.id == uid))
                user = user_result.scalar_one_or_none()
                if user:
                    display = user.name or user.email.split("@")[0]
                    slug = _re.sub(r"[^a-z0-9]+", "-", display.lower()).strip("-")[:80] + "-workspace"
                    # Ensure unique slug
                    existing_slug = await db.execute(select(Organization.id).where(Organization.slug == slug))
                    if existing_slug.scalar_one_or_none():
                        slug = f"{slug}-{str(uid)[:8]}"
                    org = Organization(name=f"{display}'s Workspace", slug=slug)
                    db.add(org)
                    await db.flush()
                    membership = UserOrg(user_id=uid, org_id=org.id, role="owner")
                    db.add(membership)

                    # Migrate this user's existing data from the placeholder org to their new org
                    from sqlalchemy import update

                    from backend.models import (
                        AgentPersona,
                        AnalyticsEvent,
                        Artifact,
                        Conversation,
                        Document,
                        Feedback,
                        FrontendError,
                        KnowledgeBase,
                        Memory,
                        Message,
                        Project,
                        UsageLog,
                    )

                    placeholder = uuid.UUID("00000000-0000-0000-0000-000000000001")
                    for model in [
                        Conversation,
                        Project,
                        AgentPersona,
                        KnowledgeBase,
                        Memory,
                        UsageLog,
                        FrontendError,
                        AnalyticsEvent,
                    ]:
                        if hasattr(model, "user_id"):
                            await db.execute(
                                update(model)
                                .where(model.user_id == uid, model.org_id == placeholder)  # type: ignore[attr-defined]
                                .values(org_id=org.id)
                            )
                    # Child tables: messages, artifacts, documents, feedback via conversation ownership
                    conv_ids_result = await db.execute(
                        select(Conversation.id).where(Conversation.user_id == uid, Conversation.org_id == org.id)
                    )
                    conv_ids = [r[0] for r in conv_ids_result.fetchall()]
                    if conv_ids:
                        for child_model in [Message, Artifact, Feedback]:
                            await db.execute(
                                update(child_model)
                                .where(child_model.conversation_id.in_(conv_ids), child_model.org_id == placeholder)  # type: ignore[attr-defined]
                                .values(org_id=org.id)
                            )
                    # Documents via KB ownership
                    kb_ids_result = await db.execute(
                        select(KnowledgeBase.id).where(KnowledgeBase.user_id == uid, KnowledgeBase.org_id == org.id)
                    )
                    kb_ids = [r[0] for r in kb_ids_result.fetchall()]
                    if kb_ids:
                        await db.execute(
                            update(Document)
                            .where(Document.knowledge_base_id.in_(kb_ids), Document.org_id == placeholder)
                            .values(org_id=org.id)
                        )

                    await db.commit()
                    logger.info("org_auto_created_for_existing_user", user_id=user_id_str, org_id=str(org.id))
                    return org.id
        except Exception:
            logger.warning("org_fallback_lookup_failed", user_id=user_id_str, exc_info=True)

    raise HTTPException(status_code=401, detail="No organization context — please log out and back in")


async def get_is_superadmin(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> bool:
    """Check if the current user is a platform superadmin."""
    result = await db.execute(select(User.is_superadmin).where(User.id == user_id))
    return result.scalar_one_or_none() or False


async def get_org_db(
    org_id: uuid.UUID = Depends(get_current_org),
    is_superadmin: bool = Depends(get_is_superadmin),
) -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an org-scoped DB session."""
    async for session in get_org_scoped_db(org_id, is_superadmin):
        yield session


# ── CSRF Validation ──


# Auth endpoints that are called before a session exists (no CSRF cookie yet)
_CSRF_EXEMPT_PATHS = {
    "/auth/password",
    "/auth/register",
    "/auth/refresh",
    "/auth/logout",
    "/auth/forgot-password",
    "/auth/switch-org",
}


async def validate_csrf(request: Request) -> None:
    """Validate CSRF token on state-changing requests using cookie-based auth.

    Skipped when using Bearer token auth (not vulnerable to CSRF).
    Skipped for auth endpoints that run before a session exists.
    """
    # Only validate if using cookie-based auth
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        return  # Bearer tokens aren't subject to CSRF

    if request.method in ("GET", "HEAD", "OPTIONS"):
        return  # Safe methods don't need CSRF

    if request.url.path in _CSRF_EXEMPT_PATHS:
        return  # Pre-session auth endpoints

    csrf_header = request.headers.get("X-CSRF-Token", "")
    if not csrf_header:
        raise HTTPException(status_code=403, detail="CSRF token missing")

    session_claims = _get_claims_from_session_cookie(request)
    if session_claims is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = session_claims.get("sub", "")
    iat = session_claims.get("iat", "")
    org_id = session_claims.get("org_id", "")
    expected_csrf = generate_csrf_token(str(user_id), iat, str(org_id))
    if csrf_header != expected_csrf:
        raise HTTPException(status_code=403, detail="CSRF token mismatch")


# ── Routes ──


def _display_name_from_workos(workos_user) -> str | None:
    """Build a display name from WorkOS profile fields."""
    first = getattr(workos_user, "first_name", None) or ""
    last = getattr(workos_user, "last_name", None) or ""
    full = f"{first} {last}".strip()
    return full or None


def _display_name_from_email(email: str) -> str:
    """Derive a capitalised display name from an email prefix."""
    import re

    local = email.split("@")[0]
    parts = re.split(r"[.\-_]", local)
    return " ".join(p.capitalize() for p in parts if p)


async def _upsert_workos_user(workos_user, db: AsyncSession) -> User:
    """Upsert a local User from a WorkOS user profile. Returns the User."""
    import re

    result = await db.execute(select(User).where(User.workos_id == workos_user.id))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            workos_id=workos_user.id,
            email=workos_user.email,
            name=_display_name_from_workos(workos_user) or _display_name_from_email(workos_user.email),
            avatar_url=getattr(workos_user, "profile_picture_url", None),
        )
        db.add(user)
        await db.flush()

        # Bootstrap: create a personal org for the new user
        display_name = user.name or user.email.split("@")[0]
        slug_base = re.sub(r"[^a-z0-9]+", "-", display_name.lower()).strip("-")[:80]
        slug = f"{slug_base}-workspace"
        # Ensure slug uniqueness
        existing = await db.execute(select(Organization.id).where(Organization.slug == slug))
        if existing.scalar_one_or_none():
            slug = f"{slug}-{str(user.id)[:8]}"

        org = Organization(name=f"{display_name}'s Workspace", slug=slug)
        db.add(org)
        await db.flush()

        membership = UserOrg(user_id=user.id, org_id=org.id, role="owner")
        db.add(membership)
        await db.flush()

        logger.info("user_created", user_id=str(user.id), email=user.email, org_id=str(org.id))
    else:
        user.last_seen_at = datetime.now(UTC)
        user.email = workos_user.email
        user.name = _display_name_from_workos(workos_user) or user.name
        if getattr(workos_user, "profile_picture_url", None):
            user.avatar_url = workos_user.profile_picture_url
        logger.info("user_login", user_id=str(user.id), email=user.email)

    await db.commit()
    await record_audit_event(AuditAction.USER_LOGIN, actor_id=str(user.id), details={"email": user.email})
    return user


async def _get_default_org_id(user_id: uuid.UUID, db: AsyncSession) -> str | None:
    """Get the user's first org membership for session bootstrapping."""
    result = await db.execute(
        select(UserOrg.org_id).where(UserOrg.user_id == user_id).order_by(UserOrg.joined_at).limit(1)
    )
    org_id = result.scalar_one_or_none()
    return str(org_id) if org_id else None


def _set_session_cookies(response: Response, user: User, org_id: str | None = None) -> None:
    """Issue access + refresh + CSRF cookies on a response."""
    access_token = create_access_token(str(user.id), user.email, org_id=org_id)
    refresh_token = create_refresh_token(str(user.id), user.email)
    _set_auth_cookie(response, "session", access_token, settings.JWT_ACCESS_TOKEN_MINUTES * 60)
    _set_auth_cookie(response, "refresh_token", refresh_token, settings.JWT_REFRESH_TOKEN_DAYS * 86400)
    # Extract iat from the just-created access token to bind CSRF to this session
    access_payload = jwt.decode(access_token, settings.SERVER_SECRET, algorithms=[settings.JWT_ENCODING_ALGORITHM])
    csrf_token = generate_csrf_token(str(user.id), access_payload.get("iat", ""), org_id or "")
    _set_csrf_cookie(response, csrf_token, settings.JWT_REFRESH_TOKEN_DAYS * 86400)


@router.get("/login")
async def login(provider: str | None = None):
    """Redirect to OAuth provider (microsoft, github) or AuthKit fallback."""
    from fastapi.responses import RedirectResponse

    url = get_auth_url(provider)
    return RedirectResponse(url=url)


@router.get("/callback")
async def callback(
    code: str | None = None,
    db: AsyncSession = Depends(get_db),
    error: str | None = None,
    error_description: str | None = None,
):
    """Handle WorkOS OAuth callback, upsert user, issue tokens."""
    from fastapi.responses import RedirectResponse

    if error:
        logger.error("auth_callback_provider_error", error=error, description=error_description)
        frontend_url = _get_frontend_url()
        return RedirectResponse(url=f"{frontend_url}/login#error=auth_failed")

    if not code:
        return RedirectResponse(url=_get_frontend_url())

    try:
        auth_response = exchange_code(code)
        workos_user = auth_response.user
        logger.info("auth_callback_code_exchanged", email=getattr(workos_user, "email", "unknown"))
    except Exception as e:
        logger.error("auth_callback_failed", error=str(e), error_type=type(e).__name__)
        frontend_url = _get_frontend_url()
        return RedirectResponse(url=f"{frontend_url}/login#error=auth_failed")

    user = await _upsert_workos_user(workos_user, db)
    org_id = await _get_default_org_id(user.id, db)

    frontend_url = _get_frontend_url()
    response = RedirectResponse(url=frontend_url, status_code=302)
    _set_session_cookies(response, user, org_id=org_id)
    logger.info("auth_callback_success", user_id=str(user.id), org_id=org_id, redirect_to=frontend_url)
    return response


class PasswordLoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str | None = None


@router.post("/password")
async def password_login(body: PasswordLoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Authenticate with email + password via WorkOS."""
    client = _get_workos_client()
    try:
        auth_response = client.user_management.authenticate_with_password(
            email=body.email,
            password=body.password,
        )
        workos_user = auth_response.user
    except Exception as e:
        error_msg = str(e)
        logger.warning("password_login_failed", email=body.email, error=error_msg)
        raise HTTPException(status_code=401, detail="Invalid email or password") from None

    user = await _upsert_workos_user(workos_user, db)
    org_id = await _get_default_org_id(user.id, db)
    _set_session_cookies(response, user, org_id=org_id)
    return {"ok": True}


@router.post("/register")
async def register(body: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Create a new account with email + password via WorkOS."""
    client = _get_workos_client()
    try:
        workos_user = client.user_management.create_user(
            email=body.email,
            password=body.password,
            first_name=body.name or body.email.split("@")[0],
        )
    except Exception as e:
        error_msg = str(e)
        logger.warning("register_failed", email=body.email, error=error_msg)
        # WorkOS returns specific error messages for duplicate email, weak password, etc.
        detail = "Registration failed"
        if "already exists" in error_msg.lower() or "duplicate" in error_msg.lower():
            detail = "An account with this email already exists"
        elif "password" in error_msg.lower():
            detail = "Password does not meet requirements (min 8 characters)"
        raise HTTPException(status_code=400, detail=detail) from None

    # Now authenticate to get a proper session
    try:
        auth_response = client.user_management.authenticate_with_password(
            email=body.email,
            password=body.password,
        )
        workos_user = auth_response.user
    except Exception:
        # User created but auth failed — still upsert from the create response
        pass

    user = await _upsert_workos_user(workos_user, db)
    org_id = await _get_default_org_id(user.id, db)
    _set_session_cookies(response, user, org_id=org_id)
    return {"ok": True}


class PasswordResetRequest(BaseModel):
    email: str


@router.post("/forgot-password")
async def forgot_password(body: PasswordResetRequest):
    """Send a password reset email via WorkOS."""
    client = _get_workos_client()
    try:
        client.user_management.send_password_reset_email(email=body.email)
    except Exception as e:
        # Log but don't reveal whether the email exists
        logger.info("password_reset_requested", email=body.email, error=str(e))
    # Always return success to prevent email enumeration
    return {"ok": True, "message": "If an account exists with that email, a reset link has been sent."}


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


@router.post("/refresh")
async def refresh_token(request: Request, response: Response, body: RefreshRequest | None = None):
    """Exchange a valid refresh token for a new access token."""
    refresh_token_value = body.refresh_token if body and body.refresh_token else None
    if not refresh_token_value and request is not None:
        refresh_token_value = request.cookies.get("refresh_token")
    if not refresh_token_value:
        raise HTTPException(status_code=401, detail="Refresh token missing")
    try:
        payload = jwt.decode(
            refresh_token_value,
            settings.SERVER_SECRET,
            algorithms=[settings.JWT_ENCODING_ALGORITHM],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired") from None
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from None

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token")

    user_id = payload.get("sub")
    email = payload.get("email", "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    # Preserve the org_id from the current session cookie if available
    org_id: str | None = None
    current_claims = _get_claims_from_session_cookie(request)
    if current_claims:
        org_id = current_claims.get("org_id")

    # If no org_id from session, look up the user's default org
    if not org_id:
        try:
            async with async_session() as db:
                result = await db.execute(
                    select(UserOrg.org_id)
                    .where(UserOrg.user_id == uuid.UUID(user_id))
                    .order_by(UserOrg.joined_at)
                    .limit(1)
                )
                found = result.scalar_one_or_none()
                if found:
                    org_id = str(found)
        except Exception:
            logger.debug("org_lookup_failed_on_refresh", user_id=user_id)

    new_access = create_access_token(user_id, email, org_id=org_id)
    # Also issue a new refresh token (rotation)
    new_refresh = create_refresh_token(user_id, email)

    logger.info("token_refreshed", user_id=user_id, org_id=org_id)

    if response is not None:
        _set_auth_cookie(response, "session", new_access, settings.JWT_ACCESS_TOKEN_MINUTES * 60)
        _set_auth_cookie(response, "refresh_token", new_refresh, settings.JWT_REFRESH_TOKEN_DAYS * 86400)
        # Rotate CSRF token to match the new session
        access_payload = jwt.decode(new_access, settings.SERVER_SECRET, algorithms=[settings.JWT_ENCODING_ALGORITHM])
        csrf_token = generate_csrf_token(user_id, access_payload.get("iat", ""), org_id or "")
        _set_csrf_cookie(response, csrf_token, settings.JWT_REFRESH_TOKEN_DAYS * 86400)

    return {
        "expires_in": settings.JWT_ACCESS_TOKEN_MINUTES * 60,
        "ok": True,
    }


@router.post("/logout")
async def logout_endpoint(response: Response):
    """Clear session cookie and CSRF cookie."""
    response.delete_cookie("session", domain=settings.cookie_domain)
    response.delete_cookie("refresh_token", domain=settings.cookie_domain)
    response.delete_cookie("csrf_token", domain=settings.cookie_domain)
    return {"ok": True}


@router.get("/me")
async def me(
    request: Request,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return current user info with org context."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get org memberships
    memberships_result = await db.execute(
        select(UserOrg, Organization)
        .join(Organization, UserOrg.org_id == Organization.id)
        .where(UserOrg.user_id == user_id)
        .order_by(UserOrg.joined_at)
    )
    memberships = memberships_result.all()

    # Determine current org from JWT
    claims = _get_claims_from_session_cookie(request)
    current_org_id = claims.get("org_id") if claims else None
    current_org = None
    current_role = "editor"

    membership_list = []
    for user_org, org in memberships:
        entry = {
            "orgId": str(org.id),
            "orgName": org.name,
            "orgSlug": org.slug,
            "role": user_org.role,
            "joinedAt": user_org.joined_at.isoformat() if user_org.joined_at else None,
        }
        membership_list.append(entry)
        if current_org_id and str(org.id) == current_org_id:
            current_org = {
                "id": str(org.id),
                "name": org.name,
                "slug": org.slug,
                "systemPrompt": org.system_prompt,
                "settings": org.settings or {},
                "createdAt": org.created_at.isoformat() if org.created_at else None,
                "updatedAt": org.updated_at.isoformat() if org.updated_at else None,
            }
            current_role = user_org.role

    # Fallback: if no current org in token, use first membership
    if not current_org and membership_list:
        first_org_membership = memberships[0]
        user_org, org = first_org_membership
        current_org = {
            "id": str(org.id),
            "name": org.name,
            "slug": org.slug,
            "systemPrompt": org.system_prompt,
            "settings": org.settings or {},
            "createdAt": org.created_at.isoformat() if org.created_at else None,
            "updatedAt": org.updated_at.isoformat() if org.updated_at else None,
        }
        current_role = user_org.role

    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "avatarUrl": user.avatar_url,
        "isSuperadmin": user.is_superadmin,
        "role": current_role,
        "currentOrg": current_org,
        "memberships": membership_list,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


class SwitchOrgRequest(BaseModel):
    org_id: str


@router.post("/switch-org")
async def switch_org(
    body: SwitchOrgRequest,
    response: Response,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Switch to a different org. Validates membership and re-mints JWT."""
    try:
        target_org_id = uuid.UUID(body.org_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid org_id") from None

    # Verify membership
    result = await db.execute(select(UserOrg).where(UserOrg.user_id == user_id, UserOrg.org_id == target_org_id))
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")

    # Get user for email
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one()

    _set_session_cookies(response, user, org_id=str(target_org_id))
    await record_audit_event(
        AuditAction.USER_LOGIN,
        actor_id=str(user_id),
        details={"action": "switch_org", "org_id": str(target_org_id)},
    )
    return {"ok": True}
