import hashlib
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db import get_db
from backend.logging_config import get_logger
from backend.models import User
from backend.services.audit import AuditAction, record_audit_event

logger = get_logger("auth")

_workos_client = None


def _get_workos_client():
    global _workos_client
    if _workos_client is None:
        if not settings.WORKOS_API_KEY or not settings.WORKOS_CLIENT_ID:
            raise HTTPException(status_code=503, detail="WorkOS not configured")
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


def create_access_token(user_id: str, email: str) -> str:
    """Creates a short-lived JWT access token (1 hour)."""
    now = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_MINUTES),
        "iat": now,
    }
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


def generate_csrf_token(session_id: str) -> str:
    """Generate a CSRF token tied to the user's session."""
    raw = f"{session_id}:{settings.SERVER_SECRET}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _get_user_id_from_session_cookie(request: Request) -> uuid.UUID | None:
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
        return uuid.UUID(user_id)
    except ValueError:
        return None


async def get_current_user(request: Request) -> uuid.UUID:
    """FastAPI dependency: extracts JWT from Authorization header or session cookie."""
    token = None
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
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


# ── CSRF Validation ──


# Auth endpoints that are called before a session exists (no CSRF cookie yet)
_CSRF_EXEMPT_PATHS = {"/auth/password", "/auth/register", "/auth/refresh", "/auth/logout"}


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

    user_id = _get_user_id_from_session_cookie(request)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    expected_csrf = generate_csrf_token(str(user_id))
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
    result = await db.execute(select(User).where(User.workos_id == workos_user.id))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            workos_id=workos_user.id,
            email=workos_user.email,
            name=_display_name_from_workos(workos_user) or _display_name_from_email(workos_user.email),
            avatar_url=getattr(workos_user, "profile_picture_url", None),
            role="editor",
        )
        db.add(user)
        await db.flush()
        logger.info("user_created", user_id=str(user.id), email=user.email)
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


def _set_session_cookies(response: Response, user: User) -> None:
    """Issue access + refresh + CSRF cookies on a response."""
    access_token = create_access_token(str(user.id), user.email)
    refresh_token = create_refresh_token(str(user.id), user.email)
    _set_auth_cookie(response, "session", access_token, settings.JWT_ACCESS_TOKEN_MINUTES * 60)
    _set_auth_cookie(response, "refresh_token", refresh_token, settings.JWT_REFRESH_TOKEN_DAYS * 86400)
    csrf_token = generate_csrf_token(str(user.id))
    _set_csrf_cookie(response, csrf_token, settings.JWT_REFRESH_TOKEN_DAYS * 86400)


@router.get("/login")
async def login(provider: str | None = None):
    """Redirect to OAuth provider (microsoft, github) or AuthKit fallback."""
    from fastapi.responses import RedirectResponse

    url = get_auth_url(provider)
    return RedirectResponse(url=url)


@router.get("/callback")
async def callback(code: str | None = None, db: AsyncSession = Depends(get_db)):
    """Handle WorkOS OAuth callback, upsert user, issue tokens."""
    from fastapi.responses import RedirectResponse

    if not code:
        return RedirectResponse(url=_get_frontend_url())

    try:
        auth_response = exchange_code(code)
        workos_user = auth_response.user
    except Exception as e:
        logger.error("auth_callback_failed", error=str(e))
        frontend_url = _get_frontend_url()
        return RedirectResponse(url=f"{frontend_url}/login?error=auth_failed")

    user = await _upsert_workos_user(workos_user, db)

    frontend_url = _get_frontend_url()
    response = RedirectResponse(url=frontend_url)
    _set_session_cookies(response, user)
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
    _set_session_cookies(response, user)
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
    _set_session_cookies(response, user)
    return {"ok": True}


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

    new_access = create_access_token(user_id, email)
    # Also issue a new refresh token (rotation)
    new_refresh = create_refresh_token(user_id, email)

    logger.info("token_refreshed", user_id=user_id)

    if response is not None:
        _set_auth_cookie(response, "session", new_access, settings.JWT_ACCESS_TOKEN_MINUTES * 60)
        _set_auth_cookie(response, "refresh_token", new_refresh, settings.JWT_REFRESH_TOKEN_DAYS * 86400)

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
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return current user info."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "avatarUrl": user.avatar_url,
        "role": user.role or ("admin" if user.is_admin else "editor"),
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
