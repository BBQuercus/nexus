"""Tests for backend.auth — JWT token generation/validation, CSRF, and
get_current_user dependency.

Covers: create_access_token, create_refresh_token, token expiration,
CSRF validation, invalid/missing token handling, generate_csrf_token.
"""

import os
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

os.environ.setdefault("LITE_LLM_API_KEY", "test-key")
os.environ.setdefault("LITE_LLM_URL", "https://example.com")
os.environ.setdefault("SERVER_SECRET", "test-secret-with-sufficient-length-123456")

import jwt
from fastapi import HTTPException
from starlette.requests import Request

from backend.auth import (
    _get_admin_api_user_id,
    create_access_token,
    create_refresh_token,
    generate_csrf_token,
    get_current_user,
    validate_csrf,
)
from backend.config import settings


def _make_request(
    method: str = "POST",
    headers: dict[str, str] | None = None,
) -> Request:
    raw_headers = []
    for key, value in (headers or {}).items():
        raw_headers.append((key.lower().encode("latin-1"), value.encode("latin-1")))
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": raw_headers,
        "client": ("127.0.0.1", 1234),
        "server": ("testserver", 80),
        "scheme": "http",
    }
    return Request(scope)


class TestJWTTokenGeneration(unittest.TestCase):
    """Tests for JWT access and refresh token creation."""

    def test_create_access_token_is_decodable(self):
        user_id = str(uuid.uuid4())
        token = create_access_token(user_id, "test@example.com")
        payload = jwt.decode(
            token, settings.SERVER_SECRET, algorithms=[settings.JWT_ENCODING_ALGORITHM]
        )
        self.assertEqual(payload["sub"], user_id)
        self.assertEqual(payload["email"], "test@example.com")
        self.assertEqual(payload["type"], "access")

    def test_create_refresh_token_is_decodable(self):
        user_id = str(uuid.uuid4())
        token = create_refresh_token(user_id, "test@example.com")
        payload = jwt.decode(
            token, settings.SERVER_SECRET, algorithms=[settings.JWT_ENCODING_ALGORITHM]
        )
        self.assertEqual(payload["sub"], user_id)
        self.assertEqual(payload["type"], "refresh")

    def test_access_token_has_correct_expiry(self):
        user_id = str(uuid.uuid4())
        before = datetime.now(timezone.utc)
        token = create_access_token(user_id, "test@example.com")
        after = datetime.now(timezone.utc)

        payload = jwt.decode(
            token, settings.SERVER_SECRET, algorithms=[settings.JWT_ENCODING_ALGORITHM]
        )
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        expected_min = before + timedelta(minutes=settings.JWT_ACCESS_TOKEN_MINUTES)
        expected_max = after + timedelta(minutes=settings.JWT_ACCESS_TOKEN_MINUTES)
        self.assertGreaterEqual(exp, expected_min - timedelta(seconds=2))
        self.assertLessEqual(exp, expected_max + timedelta(seconds=2))

    def test_refresh_token_has_correct_expiry(self):
        user_id = str(uuid.uuid4())
        token = create_refresh_token(user_id, "test@example.com")
        payload = jwt.decode(
            token, settings.SERVER_SECRET, algorithms=[settings.JWT_ENCODING_ALGORITHM]
        )
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        iat = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
        delta = exp - iat
        self.assertAlmostEqual(
            delta.total_seconds(),
            settings.JWT_REFRESH_TOKEN_DAYS * 86400,
            delta=5,
        )

    def test_token_with_wrong_secret_fails(self):
        user_id = str(uuid.uuid4())
        token = create_access_token(user_id, "test@example.com")
        with self.assertRaises(jwt.InvalidSignatureError):
            jwt.decode(token, "wrong-secret", algorithms=[settings.JWT_ENCODING_ALGORITHM])


class TestJWTTokenExpiration(unittest.TestCase):
    """Tests for expired token handling."""

    def test_expired_access_token_is_rejected(self):
        user_id = str(uuid.uuid4())
        payload = {
            "sub": user_id,
            "email": "test@example.com",
            "type": "access",
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            "iat": datetime.now(timezone.utc) - timedelta(hours=2),
        }
        token = jwt.encode(
            payload, settings.SERVER_SECRET, algorithm=settings.JWT_ENCODING_ALGORITHM
        )
        with self.assertRaises(jwt.ExpiredSignatureError):
            jwt.decode(
                token,
                settings.SERVER_SECRET,
                algorithms=[settings.JWT_ENCODING_ALGORITHM],
            )


class TestGetCurrentUser(unittest.IsolatedAsyncioTestCase):
    """Tests for the get_current_user FastAPI dependency."""

    async def test_extracts_user_from_bearer_token(self):
        user_id = uuid.uuid4()
        token = create_access_token(str(user_id), "test@example.com")
        request = _make_request(headers={"authorization": f"Bearer {token}"})
        result = await get_current_user(request)
        self.assertEqual(result, user_id)

    async def test_extracts_user_from_configured_admin_api_token(self):
        user_id = uuid.uuid4()
        with patch.object(settings, "ADMIN_API_TOKEN", "admin-token"), patch.object(
            settings, "ADMIN_API_USER_ID", str(user_id)
        ):
            request = _make_request(headers={"authorization": "Bearer admin-token"})
            result = await get_current_user(request)
        self.assertEqual(result, user_id)

    async def test_extracts_user_from_session_cookie(self):
        user_id = uuid.uuid4()
        token = create_access_token(str(user_id), "test@example.com")
        request = _make_request(headers={"cookie": f"session={token}"})
        result = await get_current_user(request)
        self.assertEqual(result, user_id)

    async def test_rejects_missing_token(self):
        request = _make_request(headers={})
        with self.assertRaises(HTTPException) as ctx:
            await get_current_user(request)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Not authenticated")

    async def test_rejects_refresh_token_for_api_access(self):
        user_id = uuid.uuid4()
        token = create_refresh_token(str(user_id), "test@example.com")
        request = _make_request(headers={"authorization": f"Bearer {token}"})
        with self.assertRaises(HTTPException) as ctx:
            await get_current_user(request)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Invalid token type")

    async def test_rejects_expired_token(self):
        user_id = str(uuid.uuid4())
        payload = {
            "sub": user_id,
            "email": "test@example.com",
            "type": "access",
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            "iat": datetime.now(timezone.utc) - timedelta(hours=2),
        }
        token = jwt.encode(
            payload, settings.SERVER_SECRET, algorithm=settings.JWT_ENCODING_ALGORITHM
        )
        request = _make_request(headers={"authorization": f"Bearer {token}"})
        with self.assertRaises(HTTPException) as ctx:
            await get_current_user(request)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Token expired")

    async def test_rejects_malformed_token(self):
        request = _make_request(headers={"authorization": "Bearer not-a-jwt"})
        with self.assertRaises(HTTPException) as ctx:
            await get_current_user(request)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Invalid token")

    async def test_rejects_admin_api_token_when_configured_user_id_is_invalid(self):
        with patch.object(settings, "ADMIN_API_TOKEN", "admin-token"), patch.object(
            settings, "ADMIN_API_USER_ID", "not-a-uuid"
        ):
            request = _make_request(headers={"authorization": "Bearer admin-token"})
            with self.assertRaises(HTTPException) as ctx:
                await get_current_user(request)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Invalid token")

    async def test_rejects_token_without_sub_claim(self):
        payload = {
            "email": "test@example.com",
            "type": "access",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            "iat": datetime.now(timezone.utc),
        }
        token = jwt.encode(
            payload, settings.SERVER_SECRET, algorithm=settings.JWT_ENCODING_ALGORITHM
        )
        request = _make_request(headers={"authorization": f"Bearer {token}"})
        with self.assertRaises(HTTPException) as ctx:
            await get_current_user(request)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Invalid token")


class TestCSRFValidation(unittest.IsolatedAsyncioTestCase):
    """Tests for CSRF token validation."""

    async def test_skips_bearer_auth(self):
        request = _make_request(headers={"authorization": "Bearer any-token"})
        await validate_csrf(request)  # Should not raise

    async def test_skips_safe_methods(self):
        for method in ("GET", "HEAD", "OPTIONS"):
            request = _make_request(method=method)
            await validate_csrf(request)  # Should not raise

    async def test_rejects_missing_csrf_token(self):
        request = _make_request(headers={"cookie": "session=abc"})
        with self.assertRaises(HTTPException) as ctx:
            await validate_csrf(request)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "CSRF token missing")

    async def test_rejects_mismatched_csrf_tokens(self):
        user_id = uuid.uuid4()
        session_token = create_access_token(str(user_id), "test@example.com")
        wrong_csrf = generate_csrf_token("wrong-user-id", 0)
        request = _make_request(
            headers={
                "cookie": f"session={session_token}; csrf_token={wrong_csrf}",
                "x-csrf-token": wrong_csrf,
            }
        )
        with self.assertRaises(HTTPException) as ctx:
            await validate_csrf(request)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "CSRF token mismatch")

    async def test_accepts_matching_csrf_tokens(self):
        user_id = uuid.uuid4()
        session_token = create_access_token(str(user_id), "test@example.com")
        # Extract iat from the token to generate a matching CSRF token
        payload = jwt.decode(session_token, settings.SERVER_SECRET, algorithms=[settings.JWT_ENCODING_ALGORITHM])
        valid_csrf = generate_csrf_token(str(user_id), payload["iat"])
        request = _make_request(
            headers={
                "cookie": f"session={session_token}; csrf_token={valid_csrf}",
                "x-csrf-token": valid_csrf,
            }
        )
        await validate_csrf(request)  # Should not raise


class TestGenerateCSRFToken(unittest.TestCase):
    """Tests for the generate_csrf_token helper."""

    def test_deterministic_for_same_session_and_iat(self):
        token1 = generate_csrf_token("session-123", 1000)
        token2 = generate_csrf_token("session-123", 1000)
        self.assertEqual(token1, token2)

    def test_different_for_different_sessions(self):
        token1 = generate_csrf_token("session-1", 1000)
        token2 = generate_csrf_token("session-2", 1000)
        self.assertNotEqual(token1, token2)

    def test_different_for_different_iat(self):
        token1 = generate_csrf_token("session-1", 1000)
        token2 = generate_csrf_token("session-1", 2000)
        self.assertNotEqual(token1, token2)

    def test_returns_32_char_hex(self):
        token = generate_csrf_token("session-123", 1000)
        self.assertEqual(len(token), 32)
        # Should be valid hex
        int(token, 16)


class TestAdminApiTokenHelper(unittest.TestCase):
    def test_returns_none_for_non_matching_token(self):
        with patch.object(settings, "ADMIN_API_TOKEN", "expected"), patch.object(
            settings, "ADMIN_API_USER_ID", str(uuid.uuid4())
        ):
            self.assertIsNone(_get_admin_api_user_id("different"))

    def test_returns_uuid_for_matching_token(self):
        user_id = uuid.uuid4()
        with patch.object(settings, "ADMIN_API_TOKEN", "expected"), patch.object(
            settings, "ADMIN_API_USER_ID", str(user_id)
        ):
            self.assertEqual(_get_admin_api_user_id("expected"), user_id)


if __name__ == "__main__":
    unittest.main()
