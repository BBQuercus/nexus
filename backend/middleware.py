"""FastAPI middleware for request tracing, error handling, and CSRF protection."""

import time
import traceback
import uuid

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse

from backend.logging_config import get_logger

logger = get_logger("middleware")


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach a unique request ID to every request and bind it to the log context."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        request.state.request_id = request_id

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        start = time.monotonic()

        response = await call_next(request)

        duration_ms = round((time.monotonic() - start) * 1000, 1)
        response.headers["X-Request-Id"] = request_id

        # Log request completion (skip health checks to reduce noise)
        if request.url.path not in ("/health", "/ready"):
            logger.info(
                "request_completed",
                method=request.method,
                path=request.url.path,
                status=response.status_code,
                duration_ms=duration_ms,
            )

        structlog.contextvars.clear_contextvars()
        return response


class GlobalExceptionMiddleware(BaseHTTPMiddleware):
    """Catch all unhandled exceptions and return a structured JSON error."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        try:
            return await call_next(request)
        except Exception as exc:
            request_id = getattr(request.state, "request_id", "unknown")
            logger.error(
                "unhandled_exception",
                error=str(exc),
                traceback=traceback.format_exc(),
                path=request.url.path,
                method=request.method,
            )
            return JSONResponse(
                status_code=500,
                content={
                    "error": "internal_server_error",
                    "message": "An unexpected error occurred. Please try again.",
                    "request_id": request_id,
                },
                headers={"X-Request-Id": request_id},
            )
