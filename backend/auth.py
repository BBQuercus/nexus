import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db import get_db
from backend.models import User

logger = logging.getLogger(__name__)

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


def create_session_token(user_id: str, email: str) -> str:
    """Creates a JWT session token."""
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc)
        + timedelta(days=settings.JWT_VALIDITY_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(
        payload, settings.SERVER_SECRET, algorithm=settings.JWT_ENCODING_ALGORITHM
    )


async def get_current_user(request: Request) -> uuid.UUID:
    """FastAPI dependency: extracts and validates JWT from session cookie."""
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
        return uuid.UUID(user_id)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except (jwt.InvalidTokenError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")


@router.get("/login")
async def login():
    """Redirect to WorkOS login."""
    from fastapi.responses import RedirectResponse

    url = get_auth_url()
    return RedirectResponse(url=url)


@router.get("/callback")
async def callback(code: str, db: AsyncSession = Depends(get_db)):
    """Handle WorkOS callback, upsert user, set session cookie."""
    from fastapi.responses import RedirectResponse

    auth_response = exchange_code(code)
    workos_user = auth_response.user

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
    else:
        user.last_seen_at = datetime.now(timezone.utc)
        user.email = workos_user.email
        user.name = workos_user.first_name or user.name
        if getattr(workos_user, "profile_picture_url", None):
            user.avatar_url = workos_user.profile_picture_url

    await db.commit()

    token = create_session_token(str(user.id), user.email)
    frontend_url = _get_frontend_url()
    is_production = "localhost" not in frontend_url
    response = RedirectResponse(url=frontend_url)
    response.set_cookie(
        key="session",
        value=token,
        httponly=True,
        secure=is_production,
        samesite="lax",
        max_age=settings.JWT_VALIDITY_DAYS * 86400,
    )
    return response


@router.post("/logout")
async def logout_endpoint(response: Response):
    """Clear session cookie."""
    response.delete_cookie("session")
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
        "avatar_url": user.avatar_url,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
