"""FastAPI middleware for request tracing, error handling, and security headers.

Uses pure ASGI middleware instead of BaseHTTPMiddleware to avoid deadlocks
with streaming responses (SSE).
"""

import asyncio
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
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    "connect-src 'self' ws: wss:; "
    "font-src 'self' data:; "
    "frame-ancestors 'none'"
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


# Paths that use SSE streaming and need longer timeouts
_STREAMING_PATHS = {"/messages", "/regenerate"}

# Default request timeout (seconds)
REQUEST_TIMEOUT_DEFAULT = 30
REQUEST_TIMEOUT_CHAT = 180  # Chat/streaming endpoints get more time


class RequestTimeoutMiddleware:
    """Abort requests that exceed a configurable timeout (pure ASGI).

    SSE streaming paths get a longer timeout since they stream tokens
    for the duration of the LLM response.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        is_streaming = any(p in path for p in _STREAMING_PATHS) or path.startswith("/ws/")
        timeout = REQUEST_TIMEOUT_CHAT if is_streaming else REQUEST_TIMEOUT_DEFAULT

        try:
            await asyncio.wait_for(self.app(scope, receive, send), timeout=timeout)
        except TimeoutError:
            # Only send error if response hasn't started yet
            body = json.dumps({
                "error": "request_timeout",
                "message": "The request took too long. Please try again.",
            }).encode()
            try:
                await send({
                    "type": "http.response.start",
                    "status": 504,
                    "headers": [(b"content-type", b"application/json")],
                })
                await send({"type": "http.response.body", "body": body})
            except Exception:
                pass  # Response already started — can't send error


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


# User-friendly error messages for common HTTP status codes.
# Prevents internal details from leaking to clients.
_SANITIZED_MESSAGES: dict[int, str] = {
    401: "Session expired. Please log in again.",
    403: "You don't have permission to perform this action.",
    404: "The requested resource was not found.",
    429: "You're sending requests too quickly. Please wait a moment.",
    500: "Something unexpected happened. If this keeps occurring, please reload the page.",
    502: "An upstream service returned an error. Please try again.",
    503: "Service temporarily unavailable. Please try again shortly.",
    504: "The request took too long. Please try again.",
}

# Patterns in error details that indicate internal leaks
_LEAK_PATTERNS = ("litellm", "openai", "azure", "workos", "cohere", "daytona", "postgresql", "redis://", "sqlalchemy")


def _sanitize_detail(status_code: int, detail: str) -> str:
    """Replace error details that might leak internal service names."""
    detail_lower = detail.lower()
    if any(pattern in detail_lower for pattern in _LEAK_PATTERNS):
        return _SANITIZED_MESSAGES.get(status_code, _SANITIZED_MESSAGES[500])
    return detail


class GlobalExceptionMiddleware:
    """Catch unhandled exceptions and return structured JSON (pure ASGI).

    Also intercepts error responses to sanitize details that might leak
    internal service names or routing information.
    """

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
                    "message": _SANITIZED_MESSAGES[500],
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
