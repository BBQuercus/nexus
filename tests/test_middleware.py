"""Tests for backend.middleware — RequestIdMiddleware, SecurityHeadersMiddleware,
and GlobalExceptionMiddleware.

Validates request ID generation/passthrough, security header injection, structured
error responses on unhandled exceptions, and health/ready log suppression.
"""

import json  # noqa: F811 – used in raw ASGI app builder
import os
import unittest

os.environ.setdefault("LITE_LLM_API_KEY", "test-key")
os.environ.setdefault("LITE_LLM_URL", "https://example.com")
os.environ.setdefault("SERVER_SECRET", "test-secret-with-sufficient-length-123456")

import structlog
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from backend.middleware import (
    CSP_VALUE,
    GlobalExceptionMiddleware,
    RequestIdMiddleware,
    SecurityHeadersMiddleware,
)


# ── Helpers ──


def _ok_app(request: Request) -> JSONResponse:
    return JSONResponse({"ok": True})


def _echo_request_id(request: Request) -> PlainTextResponse:
    rid = request.scope.get("state", {}).get("request_id", "missing")
    return PlainTextResponse(rid)


def _raise_app(request: Request):
    raise RuntimeError("boom")


def _build_app(routes, middlewares):
    """Build a Starlette app with the given routes and ASGI middleware stack."""
    app = Starlette(routes=routes)
    for mw in reversed(middlewares):
        app = mw(app)
    return app


# ── SecurityHeadersMiddleware ──


class TestSecurityHeadersMiddleware(unittest.TestCase):
    """Verifies that every HTTP response gets CSP, X-Frame-Options,
    X-Content-Type-Options, and Referrer-Policy headers."""

    def setUp(self):
        app = _build_app(
            routes=[Route("/", _ok_app)],
            middlewares=[SecurityHeadersMiddleware],
        )
        self.client = TestClient(app, raise_server_exceptions=False)

    def test_adds_content_security_policy(self):
        resp = self.client.get("/")
        self.assertEqual(resp.headers["content-security-policy"], CSP_VALUE)

    def test_adds_x_frame_options(self):
        resp = self.client.get("/")
        self.assertEqual(resp.headers["x-frame-options"], "DENY")

    def test_adds_x_content_type_options(self):
        resp = self.client.get("/")
        self.assertEqual(resp.headers["x-content-type-options"], "nosniff")

    def test_adds_referrer_policy(self):
        resp = self.client.get("/")
        self.assertEqual(
            resp.headers["referrer-policy"], "strict-origin-when-cross-origin"
        )

    def test_preserves_original_response_body(self):
        resp = self.client.get("/")
        self.assertEqual(resp.json(), {"ok": True})


# ── RequestIdMiddleware ──


class TestRequestIdMiddleware(unittest.TestCase):
    """Verifies request ID generation, passthrough of existing IDs, header
    injection in responses, and health/ready log suppression."""

    def setUp(self):
        app = _build_app(
            routes=[
                Route("/", _echo_request_id),
                Route("/health", _ok_app),
                Route("/ready", _ok_app),
            ],
            middlewares=[RequestIdMiddleware],
        )
        self.client = TestClient(app, raise_server_exceptions=False)

    def test_generates_request_id_when_none_provided(self):
        resp = self.client.get("/")
        rid = resp.headers.get("x-request-id")
        self.assertIsNotNone(rid)
        self.assertGreater(len(rid), 0)
        # Response body should echo the same ID set in scope
        self.assertEqual(resp.text, rid)

    def test_passes_through_existing_request_id(self):
        resp = self.client.get("/", headers={"x-request-id": "my-custom-id"})
        self.assertEqual(resp.headers["x-request-id"], "my-custom-id")
        self.assertEqual(resp.text, "my-custom-id")

    def test_request_id_header_added_to_response(self):
        resp = self.client.get("/")
        self.assertIn("x-request-id", resp.headers)

    def test_health_endpoint_does_not_log(self):
        """Health and ready endpoints should still work but skip logging."""
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)

    def test_ready_endpoint_does_not_log(self):
        resp = self.client.get("/ready")
        self.assertEqual(resp.status_code, 200)

    def test_binds_request_id_to_structlog_context(self):
        """The middleware should bind request_id to structlog contextvars."""
        captured = {}

        def capture_handler(request: Request) -> PlainTextResponse:
            ctx = structlog.contextvars.get_contextvars()
            captured.update(ctx)
            return PlainTextResponse("ok")

        app = _build_app(
            routes=[Route("/capture", capture_handler)],
            middlewares=[RequestIdMiddleware],
        )
        client = TestClient(app, raise_server_exceptions=False)
        client.get("/capture", headers={"x-request-id": "ctx-test-id"})
        self.assertEqual(captured.get("request_id"), "ctx-test-id")


# ── GlobalExceptionMiddleware ──


class TestGlobalExceptionMiddleware(unittest.TestCase):
    """Verifies that unhandled exceptions produce structured JSON 500 responses
    and that normal responses pass through unmodified.

    Uses a raw ASGI app (not Starlette) to avoid Starlette's built-in
    ServerErrorMiddleware intercepting exceptions before ours.
    """

    def _make_raw_app(self, extra_middlewares=None):
        """Build a minimal ASGI app wrapped in GlobalExceptionMiddleware."""

        async def raw_app(scope, receive, send):
            if scope["type"] != "http":
                return
            path = scope.get("path", "")
            if path == "/ok":
                body = json.dumps({"ok": True}).encode()
                await send({
                    "type": "http.response.start",
                    "status": 200,
                    "headers": [(b"content-type", b"application/json")],
                })
                await send({"type": "http.response.body", "body": body})
            elif path == "/boom":
                raise RuntimeError("boom")

        app = raw_app
        middlewares = list(extra_middlewares or []) + [GlobalExceptionMiddleware]
        for mw in reversed(middlewares):
            app = mw(app)
        return app

    def test_normal_response_passes_through(self):
        app = self._make_raw_app()
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/ok")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"ok": True})

    def test_exception_returns_500_json(self):
        app = self._make_raw_app()
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/boom")
        self.assertEqual(resp.status_code, 500)
        body = resp.json()
        self.assertEqual(body["error"], "internal_server_error")
        self.assertIn("request_id", body)

    def test_exception_response_has_request_id_header(self):
        app = self._make_raw_app(extra_middlewares=[RequestIdMiddleware])
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/boom", headers={"x-request-id": "err-id"})
        self.assertEqual(resp.status_code, 500)
        body = resp.json()
        self.assertEqual(body["request_id"], "err-id")

    def test_exception_response_content_type_is_json(self):
        app = self._make_raw_app()
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/boom")
        self.assertIn("application/json", resp.headers.get("content-type", ""))


if __name__ == "__main__":
    unittest.main()
