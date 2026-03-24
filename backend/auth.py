import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db import get_db
from backend.logging_config import get_logger
from backend.models import User

logger = get_logger("auth")

_workos_client = None


def _get_workos_client():
    global _workos_client
    if _workos_client is None:
        if not settings.WORKOS_API_KEY or not settings.WORKOS_CLIENT_ID:
            raise HTTPException(
                status_code=503, detail="WorkOS not configured"
            )
        import workos

        _workos_client = workos.WorkOSClient(
            api_key=settings.WORKOS_API_KEY,
            client_id=settings.WORKOS_CLIENT_ID,
        )
    return _workos_client


router = APIRouter(prefix="/auth", tags=["auth"])


def _get_frontend_url() -> str:
    """Get the frontend URL for redirects."""
    return os.environ.get("FRONTEND_URL", "http://localhost:5173")


def get_auth_url() -> str:
    """Returns WorkOS authorization URL."""
    client = _get_workos_client()
    return client.user_management.get_authorization_url(
        redirect_uri=settings.WORKOS_REDIRECT_URI,
        provider="authkit",
    )


def exchange_code(code: str):
    """Exchanges auth code for user profile via WorkOS."""
    client = _get_workos_client()
    return client.user_management.authenticate_with_code(code=code)


def create_access_token(user_id: str, email: str) -> str:
    """Creates a short-lived JWT access token (1 hour)."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_MINUTES),
        "iat": now,
    }
    return jwt.encode(
        payload, settings.SERVER_SECRET, algorithm=settings.JWT_ENCODING_ALGORITHM
    )


def create_refresh_token(user_id: str, email: str) -> str:
    """Creates a long-lived JWT refresh token (7 days)."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "type": "refresh",
        "exp": now + timedelta(days=settings.JWT_REFRESH_TOKEN_DAYS),
        "iat": now,
    }
    return jwt.encode(
        payload, settings.SERVER_SECRET, algorithm=settings.JWT_ENCODING_ALGORITHM
    )


# Keep backwards compat alias
def create_session_token(user_id: str, email: str) -> str:
    return create_access_token(user_id, email)


def generate_csrf_token(session_id: str) -> str:
    """Generate a CSRF token tied to the user's session."""
    raw = f"{session_id}:{settings.SERVER_SECRET}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


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

        # Accept both access and refresh tokens for API calls
        # (refresh tokens work as a fallback when access token expires)
        token_type = payload.get("type", "access")
        if token_type not in ("access", "refresh"):
            raise HTTPException(status_code=401, detail="Invalid token type")

        return uuid.UUID(user_id)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except (jwt.InvalidTokenError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")


# ── CSRF Validation ──

async def validate_csrf(request: Request) -> None:
    """Validate CSRF token on state-changing requests using cookie-based auth.

    Skipped when using Bearer token auth (not vulnerable to CSRF).
    """
    # Only validate if using cookie-based auth
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        return  # Bearer tokens aren't subject to CSRF

    if request.method in ("GET", "HEAD", "OPTIONS"):
        return  # Safe methods don't need CSRF

    csrf_cookie = request.cookies.get("csrf_token")
    csrf_header = request.headers.get("X-CSRF-Token", "")

    if not csrf_cookie or not csrf_header:
        raise HTTPException(status_code=403, detail="CSRF token missing")
    if csrf_cookie != csrf_header:
        raise HTTPException(status_code=403, detail="CSRF token mismatch")


# ── Routes ──

@router.get("/login")
async def login():
    """Redirect to WorkOS login."""
    from fastapi.responses import RedirectResponse

    url = get_auth_url()
    return RedirectResponse(url=url)


@router.get("/callback")
async def callback(code: str, db: AsyncSession = Depends(get_db)):
    """Handle WorkOS callback, upsert user, issue access + refresh tokens."""
    from fastapi.responses import RedirectResponse

    try:
        auth_response = exchange_code(code)
        workos_user = auth_response.user
    except Exception as e:
        logger.error("auth_callback_failed", error=str(e))
        frontend_url = _get_frontend_url()
        return RedirectResponse(url=f"{frontend_url}/login?error=auth_failed")

    result = await db.execute(
        select(User).where(User.workos_id == workos_user.id)
    )
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            workos_id=workos_user.id,
            email=workos_user.email,
            name=workos_user.first_name or workos_user.email.split("@")[0],
            avatar_url=getattr(workos_user, "profile_picture_url", None),
        )
        db.add(user)
        await db.flush()
        logger.info("user_created", user_id=str(user.id), email=user.email)
    else:
        user.last_seen_at = datetime.now(timezone.utc)
        user.email = workos_user.email
        user.name = workos_user.first_name or user.name
        if getattr(workos_user, "profile_picture_url", None):
            user.avatar_url = workos_user.profile_picture_url
        logger.info("user_login", user_id=str(user.id), email=user.email)

    await db.commit()

    access_token = create_access_token(str(user.id), user.email)
    refresh_token = create_refresh_token(str(user.id), user.email)

    frontend_url = _get_frontend_url()
    redirect_url = f"{frontend_url}/auth/callback?token={access_token}&refresh_token={refresh_token}"

    response = RedirectResponse(url=redirect_url)

    # Set CSRF cookie
    csrf_token = generate_csrf_token(str(user.id))
    response.set_cookie(
        "csrf_token",
        csrf_token,
        httponly=False,  # Needs to be readable by JS
        samesite="strict",
        secure=frontend_url.startswith("https"),
        max_age=settings.JWT_REFRESH_TOKEN_DAYS * 86400,
    )

    return response


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh")
async def refresh_token(body: RefreshRequest):
    """Exchange a valid refresh token for a new access token."""
    try:
        payload = jwt.decode(
            body.refresh_token,
            settings.SERVER_SECRET,
            algorithms=[settings.JWT_ENCODING_ALGORITHM],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

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

    return {
        "access_token": new_access,
        "refresh_token": new_refresh,
        "expires_in": settings.JWT_ACCESS_TOKEN_MINUTES * 60,
    }


@router.post("/logout")
async def logout_endpoint(response: Response):
    """Clear session cookie and CSRF cookie."""
    response.delete_cookie("session")
    response.delete_cookie("csrf_token")
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
        "isAdmin": user.is_admin,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
