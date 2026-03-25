"""FastAPI middleware for request tracing, error handling, and security headers.

Uses pure ASGI middleware instead of BaseHTTPMiddleware to avoid deadlocks
with streaming responses (SSE).
"""

import json
import time
import traceback
import uuid

import structlog
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from backend.logging_config import get_logger

logger = get_logger("middleware")

CSP_VALUE = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    "connect-src 'self' ws: wss:; "
    "font-src 'self' data:"
)

SECURITY_HEADERS: list[tuple[bytes, bytes]] = [
    (b"content-security-policy", CSP_VALUE.encode()),
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
]


_UUID_PATTERN = None


def _normalize_path(path: str) -> str:
    """Replace UUIDs in path segments with {id} to avoid high-cardinality metrics."""
    global _UUID_PATTERN
    if _UUID_PATTERN is None:
        import re

        _UUID_PATTERN = re.compile(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
            re.IGNORECASE,
        )
    return _UUID_PATTERN.sub("{id}", path)


class MetricsMiddleware:
    """Record HTTP request count and duration as Prometheus metrics (pure ASGI)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        from backend.telemetry import http_request_duration, http_requests_total

        method = scope.get("method", "GET")
        path = _normalize_path(scope.get("path", ""))
        start = time.monotonic()
        status_code = 500

        async def capture_status(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 500)
            await send(message)

        try:
            await self.app(scope, receive, capture_status)
        finally:
            duration = time.monotonic() - start
            http_requests_total.labels(method=method, path=path, status_code=str(status_code)).inc()
            http_request_duration.labels(method=method, path=path).observe(duration)


class SecurityHeadersMiddleware:
    """Add security headers to every HTTP response (pure ASGI)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(SECURITY_HEADERS)
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)


class RequestIdMiddleware:
    """Attach a unique request ID and log requests (pure ASGI)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        scope.setdefault("state", {})
        scope["state"]["request_id"] = request_id

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        start = time.monotonic()
        status_code = 500  # default in case we never see the response start

        async def send_with_request_id(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 500)
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode()))
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            duration_ms = round((time.monotonic() - start) * 1000, 1)
            path = scope.get("path", "")
            if path not in ("/health", "/ready"):
                logger.info(
                    "request_completed",
                    method=scope.get("method", ""),
                    path=path,
                    status=status_code,
                    duration_ms=duration_ms,
                )
            structlog.contextvars.clear_contextvars()


class GlobalExceptionMiddleware:
    """Catch unhandled exceptions and return structured JSON (pure ASGI)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            if response_started:
                # Can't send error response if headers already sent
                raise

            request_id = scope.get("state", {}).get("request_id", "unknown")
            logger.error(
                "unhandled_exception",
                error=str(exc),
                traceback=traceback.format_exc(),
                path=scope.get("path", ""),
                method=scope.get("method", ""),
            )

            body = json.dumps(
                {
                    "error": "internal_server_error",
                    "message": "An unexpected error occurred. Please try again.",
                    "request_id": request_id,
                }
            ).encode()

            await send(
                {
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"x-request-id", request_id.encode()),
                    ],
                }
            )
            await send(
                {
                    "type": "http.response.body",
                    "body": body,
                }
            )
