import asyncio
import contextlib
import json
import os
import uuid
from contextlib import asynccontextmanager
from typing import Any

import jwt
from fastapi import Depends, FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

import backend.indexes  # noqa: F401 — register DB indexes
from backend.auth import get_current_user, validate_csrf
from backend.auth import router as auth_router
from backend.config import settings
from backend.db import Base, async_session, engine, get_db
from backend.logging_config import get_logger, setup_logging
from backend.middleware import (
    GlobalExceptionMiddleware,
    MetricsMiddleware,
    RequestIdMiddleware,
    RequestTimeoutMiddleware,
    SecurityHeadersMiddleware,
)
from backend.models import FrontendError, User
from backend.routers.admin import router as admin_router
from backend.routers.admin_analytics import router as admin_analytics_router
from backend.routers.agents import router as agents_router
from backend.routers.analytics import router as analytics_router
from backend.routers.chat import artifact_router
from backend.routers.chat import router as chat_router
from backend.routers.compliance import router as compliance_router
from backend.routers.feedback import router as feedback_router
from backend.routers.integrations import router as integrations_router
from backend.routers.jobs import router as jobs_router
from backend.routers.knowledge import doc_router as knowledge_doc_router
from backend.routers.knowledge import retrieval_router as knowledge_retrieval_router
from backend.routers.knowledge import router as knowledge_router
from backend.routers.media import router as media_router
from backend.routers.memory import router as memory_router
from backend.routers.projects import router as projects_router
from backend.routers.sandboxes import router as sandboxes_router
from backend.routers.search import router as search_router
from backend.routers.tts import router as tts_router
from backend.routers.users import router as users_router
from backend.services import sandbox as sandbox_service
from backend.services.audit import flush_audit_buffer
from backend.telemetry import active_websockets, errors_total, setup_telemetry
from backend.vector_db import ensure_vector_schema

try:
    from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
except ImportError:
    CONTENT_TYPE_LATEST = "text/plain"  # type: ignore[assignment]
    generate_latest = None  # type: ignore[assignment]
from backend.version import BUILD_SHA, VERSION

# Initialize structured logging
setup_logging(json_output=not os.environ.get("DEV_MODE"), log_level="INFO")
logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):

    from sqlalchemy import text as sa_text

    from backend.redis import close_redis, get_redis
    from backend.services.cleanup import start_cleanup_loop
    from backend.services.jobs import start_job_worker

    await ensure_vector_schema()

    should_manage_schema = settings.AUTO_APPLY_DB_SCHEMA or bool(os.environ.get("DEV_MODE"))
    if not should_manage_schema:
        logger.info("database_schema_management_skipped")
        await get_redis()
        setup_telemetry(app=app, db_engine=engine)
        cleanup_task = asyncio.create_task(start_cleanup_loop())
        job_worker_task = await start_job_worker()
        yield
        logger.info("graceful_shutdown_started")
        cleanup_task.cancel()
        job_worker_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await cleanup_task
        with contextlib.suppress(asyncio.CancelledError):
            await job_worker_task
        await close_redis()
        await flush_audit_buffer()
        await asyncio.sleep(1)
        await engine.dispose()
        logger.info("database_engine_disposed")
        return

    # Try to enable pgvector in its own transaction.
    pgvector_ok = False
    try:
        async with engine.begin() as conn:
            await conn.execute(sa_text("CREATE EXTENSION IF NOT EXISTS vector"))
        pgvector_ok = True
    except Exception as e:
        logger.warning(
            "pgvector_extension_unavailable",
            error=str(e),
            hint="Install pgvector for RAG features. RAG will be disabled without it.",
        )

    # Create all tables.  If pgvector is missing, exclude the chunks table
    # (which depends on the VECTOR type) so the rest of the app still starts.
    async with engine.begin() as conn:
        if pgvector_ok:
            await conn.run_sync(Base.metadata.create_all)
        else:
            from backend.models import Chunk

            tables_without_vector = [t for t in Base.metadata.sorted_tables if t.name != Chunk.__tablename__]
            await conn.run_sync(lambda sync_conn: Base.metadata.create_all(sync_conn, tables=tables_without_vector))

    # Migrate existing tables: add columns that create_all won't add to
    # already-existing tables.  Each runs in its own transaction so a
    # "column already exists" error doesn't poison the next statement.
    migrations = [
        ("conversations", "knowledge_base_ids", "JSON"),
        ("agent_personas", "knowledge_base_ids", "JSON"),
        ("messages", "citations", "JSON"),
    ]
    for table, column, col_type in migrations:
        try:
            async with engine.begin() as conn:
                await conn.execute(sa_text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}"))
        except Exception:
            pass  # table might not exist yet either — harmless

    # Backfill role from is_admin for users that don't have a role set yet
    try:
        async with engine.begin() as conn:
            await conn.execute(
                sa_text("UPDATE users SET role = 'admin' WHERE is_admin = true AND (role IS NULL OR role = '')")
            )
            await conn.execute(
                sa_text(
                    "UPDATE users SET role = 'editor' WHERE (is_admin = false OR is_admin IS NULL) AND (role IS NULL OR role = '')"
                )
            )
        logger.info("role_backfill_complete")
    except Exception as e:
        logger.warning("role_backfill_failed", error=str(e))

    logger.info("database_tables_ensured", pgvector=pgvector_ok)
    await get_redis()
    setup_telemetry(app=app, db_engine=engine)
    cleanup_task = asyncio.create_task(start_cleanup_loop())
    job_worker_task = await start_job_worker()
    yield
    logger.info("graceful_shutdown_started")
    cleanup_task.cancel()
    job_worker_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await cleanup_task
    with contextlib.suppress(asyncio.CancelledError):
        await job_worker_task
    await close_redis()
    await flush_audit_buffer()
    await asyncio.sleep(1)
    await engine.dispose()
    logger.info("database_engine_disposed")


app = FastAPI(
    title="Nexus",
    description="AI Agent Workspace with Sandboxed Code Execution",
    version="0.1.0",
    lifespan=lifespan,
    dependencies=[Depends(validate_csrf)],
)

# Middleware — order matters: outermost first
# GlobalExceptionMiddleware wraps everything so no unhandled 500s leak
app.add_middleware(GlobalExceptionMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],
)

# SecurityHeadersMiddleware adds CSP, X-Frame-Options, etc.
app.add_middleware(SecurityHeadersMiddleware)

# RequestIdMiddleware generates request IDs and binds them to log context
app.add_middleware(RequestIdMiddleware)

# MetricsMiddleware records request count and duration for Prometheus
app.add_middleware(MetricsMiddleware)

# RequestTimeoutMiddleware aborts long-running requests
app.add_middleware(RequestTimeoutMiddleware)

# Include routers
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(artifact_router)
app.include_router(sandboxes_router)
app.include_router(agents_router)
app.include_router(users_router)
app.include_router(tts_router)
app.include_router(feedback_router)
app.include_router(analytics_router)
app.include_router(admin_router)
app.include_router(knowledge_router)
app.include_router(knowledge_doc_router)
app.include_router(knowledge_retrieval_router)
app.include_router(media_router)
app.include_router(memory_router)
app.include_router(projects_router)
app.include_router(search_router)
app.include_router(integrations_router)
app.include_router(jobs_router)
app.include_router(compliance_router)
app.include_router(admin_analytics_router)


# ── Model Catalog ──


@app.get("/api/models")
async def list_models(user_id: uuid.UUID = Depends(get_current_user)):
    """Return available chat, image, and audio models."""
    from backend.services.llm import MODEL_PRICING

    # Chat models derived from pricing table (source of truth)
    chat_models = [{"id": model_id, "pricing": {"input": p[0], "output": p[1]}} for model_id, p in MODEL_PRICING.items()]
    return {
        "chat_models": chat_models,
        "image_models": [
            {"id": "gpt-image-1.5-swc", "name": "GPT Image 1.5"},
            {"id": "azure_ai/flux.2-pro", "name": "FLUX.2 Pro"},
        ],
        "audio_models": [
            {"id": "azure_ai/gpt-audio-1.5", "name": "GPT Audio 1.5"},
        ],
    }


# ── Prometheus Metrics ──


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    from starlette.responses import Response

    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )


# ── Health Check (deep) ──


async def _check_db() -> dict:
    """Check database connectivity."""
    try:
        from sqlalchemy import text

        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def _configured_llm_models() -> list[str]:
    """Return configured chat model IDs from environment."""
    models = {
        value.strip()
        for key, value in os.environ.items()
        if key.startswith("LITELLM_MODEL_") and value and value.strip()
    }
    return sorted(models)


def _extract_proxy_models(payload: Any) -> list[str]:
    """Extract model IDs from LiteLLM/OpenAI-compatible /v1/models payloads."""
    if not isinstance(payload, dict):
        return []

    data = payload.get("data")
    if not isinstance(data, list):
        return []

    models: set[str] = set()
    for item in data:
        if not isinstance(item, dict):
            continue
        model_id = item.get("id")
        if isinstance(model_id, str) and model_id.strip():
            models.add(model_id.strip())
    return sorted(models)


async def _check_llm() -> dict[str, Any]:
    """Check LiteLLM proxy reachability."""

    import httpx

    base_url = settings.LITE_LLM_URL.rstrip("/")
    health_url = f"{base_url}/health"
    models_url = f"{base_url}/v1/models"
    configured_models = _configured_llm_models()
    headers = {"Authorization": f"Bearer {settings.LITE_LLM_API_KEY}"}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            health_result, models_result = await asyncio.gather(
                client.get(health_url, headers=headers),
                client.get(models_url, headers=headers),
                return_exceptions=True,
            )

        available_models: list[str] = []
        models_error: str | None = None
        if isinstance(models_result, httpx.Response):
            try:
                available_models = _extract_proxy_models(models_result.json())
            except ValueError:
                available_models = []
        elif isinstance(models_result, Exception):
            models_error = str(models_result)

        affected_models = configured_models
        if available_models and configured_models:
            missing_models = sorted(set(configured_models) - set(available_models))
            if missing_models:
                affected_models = missing_models

        if isinstance(health_result, Exception):
            health_error = str(health_result) or health_result.__class__.__name__

            # The proxy health endpoint is often much slower than /v1/models.
            # If models are reachable, treat this as available and surface the
            # health timeout only as diagnostic metadata.
            if available_models:
                result: dict[str, Any] = {
                    "status": "ok" if not affected_models else "degraded",
                    "health_url": health_url,
                    "warning": health_error,
                }
                if affected_models:
                    result["affected_models"] = affected_models
                result["available_models"] = available_models
                return result

            result2: dict[str, Any] = {
                "status": "error",
                "error": health_error,
                "health_url": health_url,
            }
            if affected_models:
                result2["affected_models"] = affected_models
            if available_models:
                result2["available_models"] = available_models
            if models_error:
                result2["models_error"] = models_error
            return result2

        if 200 <= health_result.status_code < 300:  # type: ignore[union-attr]
            result3: dict[str, Any] = {
                "status": "ok" if not affected_models else "degraded",
                "health_url": health_url,
            }
            if affected_models:
                result3["affected_models"] = affected_models
            if available_models:
                result3["available_models"] = available_models
            return result3

        result4: dict[str, Any] = {
            "status": "degraded",
            "error": f"HTTP {health_result.status_code}",  # type: ignore[union-attr]
            "health_url": health_url,
        }
        if affected_models:
            result4["affected_models"] = affected_models
        if available_models:
            result4["available_models"] = available_models
        return result4
    except Exception as e:
        result5: dict[str, Any] = {
            "status": "error",
            "error": str(e),
            "health_url": health_url,
        }
        if configured_models:
            result5["affected_models"] = configured_models
        return result5


async def _check_redis() -> dict:
    """Check Redis connectivity."""
    from backend.redis import get_redis, is_redis_available

    if not is_redis_available():
        await get_redis()  # Try to reconnect
    from backend.redis import is_redis_available as check_avail

    if not check_avail():
        return {"status": "unavailable", "note": "Using in-memory fallback"}
    try:
        r = await get_redis()
        if r:
            await r.ping()  # type: ignore[misc]
            return {"status": "ok"}
        return {"status": "unavailable"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


async def _check_daytona() -> dict:
    """Check Daytona API reachability."""
    if not settings.DAYTONA_API_URL:
        return {"status": "unconfigured"}
    try:
        import httpx

        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"{settings.DAYTONA_API_URL}/health",
                headers={"Authorization": f"Bearer {settings.DAYTONA_API_KEY}"},
            )
            if resp.status_code < 500:
                return {"status": "ok"}
            return {"status": "degraded", "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.get("/health")
async def health():
    """Deep health check — checks DB, LLM, and Daytona."""
    import time

    start = time.monotonic()
    db_check, llm_check, daytona_check, redis_check = await asyncio.gather(
        _check_db(), _check_llm(), _check_daytona(), _check_redis()
    )
    latency_ms = round((time.monotonic() - start) * 1000, 1)

    checks = {"db": db_check, "llm": llm_check, "daytona": daytona_check, "redis": redis_check}
    # Redis unavailability doesn't degrade overall status (has in-memory fallback)
    critical_checks = {k: v for k, v in checks.items() if k != "redis"}
    all_ok = all(c["status"] in ("ok", "unconfigured") for c in critical_checks.values())

    return {
        "status": "ok" if all_ok else "degraded",
        "version": VERSION,
        "build_sha": BUILD_SHA,
        "checks": checks,
        "latency_ms": latency_ms,
    }


@app.get("/ready")
async def readiness():
    """Readiness probe — returns 503 only when the app cannot serve traffic."""
    from fastapi.responses import JSONResponse

    db_check = await _check_db()
    result = {"status": "ok" if db_check["status"] == "ok" else "degraded", "checks": {"db": db_check}}
    if result["status"] != "ok":
        return JSONResponse(status_code=503, content=result)
    return result


# ── Frontend Error Reporting ──


class FrontendErrorReport(BaseModel):
    message: str
    stack: str | None = None
    url: str | None = None
    user_agent: str | None = None
    component: str | None = None
    request_id: str | None = None
    extra: dict | None = None


@app.post("/api/errors")
async def report_frontend_error(
    body: FrontendErrorReport,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Receive and store frontend error reports."""
    logger.warning(
        "frontend_error",
        user_id=str(user_id),
        error_message=body.message,
        stack=body.stack,
        url=body.url,
        component=body.component,
    )

    error_record = FrontendError(
        user_id=user_id,
        message=body.message,
        stack=body.stack,
        url=body.url,
        user_agent=body.user_agent,
        component=body.component,
        request_id=body.request_id,
        extra=body.extra,
    )
    db.add(error_record)
    await db.commit()

    return {"ok": True}


# ── Bug Reports ──


class BugReportScreenshot(BaseModel):
    filename: str
    data_url: str  # base64 data URL (data:image/png;base64,...)


class BugReportRequest(BaseModel):
    title: str
    description: str
    severity: str = "medium"  # low, medium, high, critical
    steps_to_reproduce: str | None = None
    expected_behavior: str | None = None
    screenshots: list[BugReportScreenshot] = []
    url: str | None = None
    user_agent: str | None = None


# In-memory screenshot cache for Teams rendering (keyed by report_id/index)
_screenshot_cache: dict[str, tuple[bytes, str]] = {}  # id -> (data, content_type)
_SCREENSHOT_CACHE_MAX = 200


def _store_screenshot(data_url: str) -> str:
    """Store a base64 data URL and return a unique ID."""
    import base64

    screenshot_id = str(uuid.uuid4())

    # Parse data URL: data:image/png;base64,iVBOR...
    try:
        header, b64data = data_url.split(",", 1)
        content_type = header.split(":")[1].split(";")[0] if ":" in header else "image/png"
        raw = base64.b64decode(b64data)
    except Exception:
        return ""

    # Evict oldest entries if cache is full
    while len(_screenshot_cache) >= _SCREENSHOT_CACHE_MAX:
        oldest = next(iter(_screenshot_cache))
        del _screenshot_cache[oldest]

    _screenshot_cache[screenshot_id] = (raw, content_type)
    return screenshot_id


@app.get("/api/bug-reports/screenshots/{screenshot_id}")
async def get_bug_screenshot(screenshot_id: str):
    """Serve a cached bug report screenshot (public, no auth — needed for Teams)."""
    from fastapi.responses import Response as FastAPIResponse

    entry = _screenshot_cache.get(screenshot_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Screenshot not found or expired")
    data, content_type = entry
    return FastAPIResponse(content=data, media_type=content_type, headers={"Cache-Control": "public, max-age=86400"})


@app.post("/api/bug-reports")
async def submit_bug_report(
    body: BugReportRequest,
    request: Request,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Receive a bug report and forward it to Microsoft Teams."""
    from sqlalchemy import select

    # Get user info for the report
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    reporter = user.name if user else str(user_id)
    reporter_email = user.email if user else ""

    severity_emoji = {"low": "\U0001f7e2", "medium": "\U0001f7e1", "high": "\U0001f7e0", "critical": "\U0001f534"}.get(
        body.severity, "\U0001f7e1"
    )

    # Store screenshots and build public URLs
    screenshot_urls: list[str] = []
    base_url = str(request.base_url).rstrip("/")
    for ss in body.screenshots[:5]:
        ss_id = _store_screenshot(ss.data_url)
        if ss_id:
            screenshot_urls.append(f"{base_url}/api/bug-reports/screenshots/{ss_id}")

    logger.info(
        "bug_report_submitted",
        user_id=str(user_id),
        title=body.title,
        severity=body.severity,
        screenshot_count=len(screenshot_urls),
    )

    # Post to Teams webhook if configured
    if settings.TEAMS_WEBHOOK_URL:
        import httpx

        # Build screenshot image blocks for the card
        screenshot_blocks: list[dict] = []
        if screenshot_urls:
            screenshot_blocks.append({
                "type": "TextBlock",
                "text": f"**Screenshots** ({len(screenshot_urls)})",
                "wrap": True,
                "spacing": "Medium",
            })
            for url in screenshot_urls:
                screenshot_blocks.append({
                    "type": "Image",
                    "url": url,
                    "size": "Large",
                    "altText": "Bug report screenshot",
                })

        teams_card = {
            "type": "message",
            "attachments": [
                {
                    "contentType": "application/vnd.microsoft.card.adaptive",
                    "content": {
                        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                        "type": "AdaptiveCard",
                        "version": "1.4",
                        "body": [
                            {
                                "type": "TextBlock",
                                "size": "Medium",
                                "weight": "Bolder",
                                "text": f"{severity_emoji} Bug Report: {body.title}",
                                "wrap": True,
                            },
                            {
                                "type": "FactSet",
                                "facts": [
                                    {"title": "Reporter", "value": f"{reporter} ({reporter_email})"},
                                    {"title": "Severity", "value": body.severity.capitalize()},
                                    {"title": "URL", "value": body.url or "N/A"},
                                ],
                            },
                            {
                                "type": "TextBlock",
                                "text": "**Description**",
                                "wrap": True,
                                "spacing": "Medium",
                            },
                            {
                                "type": "TextBlock",
                                "text": body.description,
                                "wrap": True,
                            },
                            *([
                                {
                                    "type": "TextBlock",
                                    "text": "**Steps to Reproduce**",
                                    "wrap": True,
                                    "spacing": "Medium",
                                },
                                {
                                    "type": "TextBlock",
                                    "text": body.steps_to_reproduce,
                                    "wrap": True,
                                },
                            ] if body.steps_to_reproduce else []),
                            *([
                                {
                                    "type": "TextBlock",
                                    "text": "**Expected Behavior**",
                                    "wrap": True,
                                    "spacing": "Medium",
                                },
                                {
                                    "type": "TextBlock",
                                    "text": body.expected_behavior,
                                    "wrap": True,
                                },
                            ] if body.expected_behavior else []),
                            *screenshot_blocks,
                        ],
                    },
                }
            ],
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(settings.TEAMS_WEBHOOK_URL, json=teams_card)
                resp.raise_for_status()
        except Exception as e:
            logger.error("teams_webhook_failed", error=str(e))
            # Don't fail the request if Teams is down

    return {"ok": True, "message": "Bug report submitted. Thank you for your feedback!"}


# ── WebSocket Terminal ──


def _validate_ws_session(cookie_header: str | None) -> uuid.UUID | None:
    """Extract and validate user_id from session cookie in WebSocket headers."""
    if not cookie_header:
        return None

    from http.cookies import SimpleCookie

    sc = SimpleCookie()
    try:
        sc.load(cookie_header)
    except Exception:
        return None

    morsel = sc.get("session")
    token = morsel.value if morsel else None
    if not token:
        return None
    try:
        payload = jwt.decode(
            token,
            settings.SERVER_SECRET,
            algorithms=[settings.JWT_ENCODING_ALGORITHM],
        )
        if payload.get("type", "access") != "access":
            return None
        user_id = payload.get("sub")
        return uuid.UUID(user_id) if user_id else None
    except Exception:
        return None


@app.websocket("/ws/sandbox/{sandbox_id}/terminal")
async def sandbox_terminal(websocket: WebSocket, sandbox_id: str, token: str | None = None):
    """WebSocket endpoint for terminal streaming to a sandbox."""
    user_id = None
    auth_token = token
    if auth_token:
        try:
            payload = jwt.decode(
                auth_token,
                settings.SERVER_SECRET,
                algorithms=[settings.JWT_ENCODING_ALGORITHM],
            )
            if payload.get("type", "access") != "access":
                user_id = None
            else:
                uid = payload.get("sub")
                user_id = uuid.UUID(uid) if uid else None
        except Exception:
            user_id = None
    if not user_id:
        cookie_header = websocket.headers.get("cookie")
        user_id = _validate_ws_session(cookie_header)
    if not user_id:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    active_websockets.inc()
    logger.info("ws_connected", sandbox_id=sandbox_id, user_id=str(user_id))

    try:
        async with async_session() as db:
            sandbox = await sandbox_service.ensure_sandbox_access(sandbox_id, user_id, db)
    except Exception as e:
        logger.warning("ws_sandbox_not_found", sandbox_id=sandbox_id, error=str(e))
        await websocket.send_json({"type": "error", "data": f"Sandbox not found: {e}"})
        await websocket.close()
        return

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                message = {"type": "command", "command": data}

            if message.get("type") == "command":
                command = message.get("command", "")
                try:
                    result = await sandbox_service.execute_code(sandbox, "bash", command)
                    await websocket.send_json(
                        {
                            "type": "output",
                            "stdout": result.stdout,
                            "stderr": result.stderr,
                            "exit_code": result.exit_code,
                        }
                    )
                except Exception as e:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "data": str(e),
                        }
                    )
            elif message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        active_websockets.dec()
        logger.info("ws_disconnected", sandbox_id=sandbox_id)
    except Exception as e:
        active_websockets.dec()
        errors_total.labels(error_type="websocket_error", component="ws").inc()
        logger.error("ws_error", sandbox_id=sandbox_id, error=str(e))
        with contextlib.suppress(Exception):
            await websocket.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=True,
    )
