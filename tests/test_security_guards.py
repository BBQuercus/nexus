import os
import types
import unittest
import uuid
from unittest.mock import AsyncMock, patch

os.environ.setdefault("LITE_LLM_API_KEY", "test-key")
os.environ.setdefault("LITE_LLM_URL", "https://example.com")
os.environ.setdefault("SERVER_SECRET", "test-secret-with-sufficient-length-123456")

import jwt
from fastapi import HTTPException
from fastapi.responses import Response
from starlette.requests import Request

from backend.auth import (
    callback,
    create_access_token,
    generate_csrf_token,
    get_current_user,
    logout_endpoint,
    refresh_token,
    validate_csrf,
)
from backend.config import settings
from backend.main import _validate_ws_session
from backend.models import User
from backend.routers.sandboxes import serve_output_file
from backend.services import sandbox as sandbox_service


def make_request(method: str = "POST", headers: dict[str, str] | None = None) -> Request:
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


class AuthGuardTests(unittest.IsolatedAsyncioTestCase):
    def assert_cookie_flags(self, cookies: list[str], name: str, *, http_only: bool) -> None:
        cookie = next(cookie for cookie in cookies if cookie.startswith(f"{name}="))
        if http_only:
            self.assertIn("HttpOnly", cookie)
        else:
            self.assertNotIn("HttpOnly", cookie)
        if settings.cookie_secure:
            self.assertIn("Secure", cookie)

    def make_token(self, user_id: uuid.UUID, token_type: str) -> str:
        return jwt.encode(
            {"sub": str(user_id), "email": "user@example.com", "type": token_type},
            os.environ["SERVER_SECRET"],
            algorithm="HS256",
        )

    async def test_get_current_user_accepts_access_token(self):
        user_id = uuid.uuid4()
        request = make_request(headers={"authorization": f"Bearer {self.make_token(user_id, 'access')}"})

        resolved_user = await get_current_user(request)

        self.assertEqual(resolved_user, user_id)

    async def test_get_current_user_accepts_configured_admin_api_token(self):
        user_id = uuid.uuid4()
        request = make_request(headers={"authorization": "Bearer admin-token"})

        with patch.object(settings, "ADMIN_API_TOKEN", "admin-token"), patch.object(
            settings, "ADMIN_API_USER_ID", str(user_id)
        ):
            resolved_user = await get_current_user(request)

        self.assertEqual(resolved_user, user_id)

    async def test_get_current_user_rejects_refresh_token_for_api_access(self):
        user_id = uuid.uuid4()
        request = make_request(headers={"authorization": f"Bearer {self.make_token(user_id, 'refresh')}"})

        with self.assertRaises(HTTPException) as ctx:
            await get_current_user(request)

        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Invalid token type")

    async def test_validate_csrf_rejects_cookie_auth_without_matching_header(self):
        request = make_request(headers={"cookie": "session=abc; csrf_token=expected"})

        with self.assertRaises(HTTPException) as ctx:
            await validate_csrf(request)

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "CSRF token missing")

    async def test_validate_csrf_accepts_matching_token(self):
        """CSRF validation decodes the session JWT, derives the expected CSRF
        token from the user id + iat, then compares it against the X-CSRF-Token header."""
        user_id = uuid.uuid4()
        session_token = create_access_token(str(user_id), "user@example.com")
        payload = jwt.decode(session_token, os.environ["SERVER_SECRET"], algorithms=["HS256"])
        expected_csrf = generate_csrf_token(str(user_id), payload["iat"])
        request = make_request(
            headers={
                "cookie": f"session={session_token}; csrf_token={expected_csrf}",
                "x-csrf-token": expected_csrf,
            }
        )

        await validate_csrf(request)

    async def test_validate_csrf_skips_bearer_authenticated_requests(self):
        request = make_request(headers={"authorization": "Bearer token"})

        await validate_csrf(request)

    async def test_callback_sets_http_only_session_and_refresh_cookies(self):
        user_id = uuid.uuid4()
        db = AsyncMock()
        existing_user = User(
            id=user_id,
            workos_id="workos-user",
            email="user@example.com",
            name="Existing User",
        )
        db.execute.return_value = _ScalarResult(existing_user)

        workos_user = types.SimpleNamespace(
            id="workos-user",
            email="user@example.com",
            first_name="Existing",
            profile_picture_url=None,
        )

        with patch("backend.auth.exchange_code", return_value=types.SimpleNamespace(user=workos_user)):
            with patch("backend.auth._get_frontend_url", return_value="https://app.example.com"):
                response = await callback("auth-code", db)

        set_cookies = response.headers.getlist("set-cookie")
        # Auth callback now redirects to the frontend root URL
        self.assertEqual(response.headers["location"], "https://app.example.com")
        self.assert_cookie_flags(set_cookies, "session", http_only=True)
        self.assert_cookie_flags(set_cookies, "refresh_token", http_only=True)
        self.assert_cookie_flags(set_cookies, "csrf_token", http_only=False)
        db.commit.assert_awaited()

    async def test_refresh_token_uses_cookie_and_rotates_session_cookies(self):
        user_id = uuid.uuid4()
        refresh = self.make_token(user_id, "refresh")
        request = make_request(headers={"cookie": f"refresh_token={refresh}"})
        response = Response()

        with patch("backend.auth._get_frontend_url", return_value="https://app.example.com"):
            payload = await refresh_token(request, response)

        self.assertEqual(payload["ok"], True)
        self.assertIn("expires_in", payload)
        set_cookies = response.headers.getlist("set-cookie")
        self.assert_cookie_flags(set_cookies, "session", http_only=True)
        self.assert_cookie_flags(set_cookies, "refresh_token", http_only=True)

    async def test_logout_clears_all_auth_related_cookies(self):
        response = Response()

        payload = await logout_endpoint(response)

        self.assertEqual(payload, {"ok": True})
        set_cookies = response.headers.getlist("set-cookie")
        self.assertTrue(any(cookie.startswith("session=") and "Max-Age=0" in cookie for cookie in set_cookies))
        self.assertTrue(any(cookie.startswith("refresh_token=") and "Max-Age=0" in cookie for cookie in set_cookies))
        self.assertTrue(any(cookie.startswith("csrf_token=") and "Max-Age=0" in cookie for cookie in set_cookies))

    def test_validate_ws_session_accepts_access_cookie(self):
        user_id = uuid.uuid4()
        token = self.make_token(user_id, "access")

        resolved = _validate_ws_session(f"session={token}; other=value")

        self.assertEqual(resolved, user_id)

    def test_validate_ws_session_rejects_refresh_cookie(self):
        user_id = uuid.uuid4()
        token = self.make_token(user_id, "refresh")

        resolved = _validate_ws_session(f"session={token}")

        self.assertIsNone(resolved)

    def test_validate_ws_session_rejects_missing_cookie(self):
        self.assertIsNone(_validate_ws_session("csrf_token=abc"))


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class SandboxOwnershipTests(unittest.IsolatedAsyncioTestCase):
    def test_get_sandbox_owner_id_reads_direct_and_nested_labels(self):
        direct = types.SimpleNamespace(labels={"user_id": "direct-owner"})
        nested = types.SimpleNamespace(metadata=types.SimpleNamespace(labels={"user_id": "nested-owner"}))

        self.assertEqual(sandbox_service.get_sandbox_owner_id(direct), "direct-owner")
        self.assertEqual(sandbox_service.get_sandbox_owner_id(nested), "nested-owner")

    async def test_ensure_sandbox_access_allows_matching_label_owner(self):
        user_id = uuid.uuid4()
        sandbox = types.SimpleNamespace(labels={"user_id": str(user_id)})

        with patch.object(sandbox_service, "get_sandbox", AsyncMock(return_value=sandbox)):
            resolved = await sandbox_service.ensure_sandbox_access("sbx-123", user_id)

        self.assertIs(resolved, sandbox)

    async def test_ensure_sandbox_access_rejects_wrong_label_owner(self):
        sandbox = types.SimpleNamespace(labels={"user_id": str(uuid.uuid4())})

        with patch.object(sandbox_service, "get_sandbox", AsyncMock(return_value=sandbox)):
            with self.assertRaises(PermissionError):
                await sandbox_service.ensure_sandbox_access("sbx-123", uuid.uuid4())

    async def test_ensure_sandbox_access_falls_back_to_conversation_owner_lookup(self):
        user_id = uuid.uuid4()
        sandbox = types.SimpleNamespace(labels={})
        db = AsyncMock()
        db.execute.return_value = _ScalarResult(user_id)

        with patch.object(sandbox_service, "get_sandbox", AsyncMock(return_value=sandbox)):
            resolved = await sandbox_service.ensure_sandbox_access("sbx-123", user_id, db)

        self.assertIs(resolved, sandbox)

    async def test_ensure_sandbox_access_rejects_when_owner_cannot_be_verified(self):
        sandbox = types.SimpleNamespace(labels={})
        db = AsyncMock()
        db.execute.return_value = _ScalarResult(None)

        with patch.object(sandbox_service, "get_sandbox", AsyncMock(return_value=sandbox)):
            with self.assertRaises(PermissionError):
                await sandbox_service.ensure_sandbox_access("sbx-123", uuid.uuid4(), db)

    async def test_create_sandbox_cleanup_only_deletes_stopped_sandboxes_for_same_owner(self):
        deleted = []

        class FakeDaytona:
            def __init__(self):
                self.items = [
                    types.SimpleNamespace(id="same-owner-stopped", state="STOPPED", labels={"user_id": "user-1"}),
                    types.SimpleNamespace(id="other-owner-stopped", state="STOPPED", labels={"user_id": "user-2"}),
                    types.SimpleNamespace(id="same-owner-running", state="RUNNING", labels={"user_id": "user-1"}),
                ]

            def list(self):
                return types.SimpleNamespace(items=self.items)

            def delete(self, sandbox):
                deleted.append(sandbox.id)

            def create(self, params):
                self.last_params = params
                return types.SimpleNamespace(
                    id="new-sandbox",
                    process=types.SimpleNamespace(exec=lambda *_args, **_kwargs: None),
                )

        fake_daytona = FakeDaytona()
        fake_image_params = lambda **kwargs: types.SimpleNamespace(**kwargs)
        fake_snapshot_params = lambda **kwargs: types.SimpleNamespace(**kwargs)

        with patch.object(sandbox_service, "_get_daytona", return_value=fake_daytona):
            with patch("daytona_sdk.CreateSandboxFromImageParams", fake_image_params):
                with patch("daytona_sdk.CreateSandboxFromSnapshotParams", fake_snapshot_params):
                    sandbox = await sandbox_service.create_sandbox(labels={"user_id": "user-1"})

        self.assertEqual(sandbox.id, "new-sandbox")
        self.assertEqual(deleted, ["same-owner-stopped"])

    async def test_serve_output_file_forces_download_for_html_and_svg(self):
        sandbox = types.SimpleNamespace(id="sbx-123")

        async def fake_get_output_file(_sandbox, filename):
            return f"payload:{filename}".encode()

        with patch("backend.routers.sandboxes.sandbox_service.ensure_sandbox_access", AsyncMock(return_value=sandbox)):
            with patch("backend.services.media.get_output_file", side_effect=fake_get_output_file):
                html_response = await serve_output_file("sbx-123", "report.html", uuid.uuid4(), AsyncMock())
                svg_response = await serve_output_file("sbx-123", "chart.svg", uuid.uuid4(), AsyncMock())
                png_response = await serve_output_file("sbx-123", "image.png", uuid.uuid4(), AsyncMock())

        self.assertEqual(html_response.headers["content-disposition"], 'attachment; filename="report.html"')
        self.assertEqual(svg_response.headers["content-disposition"], 'attachment; filename="chart.svg"')
        self.assertEqual(png_response.media_type, "image/png")
        self.assertNotIn("content-disposition", png_response.headers)


if __name__ == "__main__":
    unittest.main()
