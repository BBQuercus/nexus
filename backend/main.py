import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Optional

import jwt
from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user, router as auth_router, validate_csrf
from backend.config import settings
from backend.db import Base, async_session, engine, get_db
from backend.logging_config import get_logger, setup_logging
from backend.middleware import GlobalExceptionMiddleware, MetricsMiddleware, RequestIdMiddleware, SecurityHeadersMiddleware
from backend.models import FrontendError
from backend.routers.admin import router as admin_router
from backend.routers.agents import router as agents_router
from backend.routers.analytics import router as analytics_router
from backend.routers.chat import artifact_router, router as chat_router
from backend.routers.feedback import router as feedback_router
from backend.routers.knowledge import router as knowledge_router, doc_router as knowledge_doc_router, retrieval_router as knowledge_retrieval_router
from backend.routers.media import router as media_router
from backend.routers.memory import router as memory_router
from backend.routers.projects import router as projects_router
from backend.routers.sandboxes import router as sandboxes_router
from backend.routers.search import router as search_router
from backend.routers.tts import router as tts_router
from backend.routers.users import router as users_router
from backend.services import sandbox as sandbox_service
from backend.telemetry import CONTENT_TYPE_LATEST, generate_latest, setup_telemetry
from backend.version import BUILD_SHA, VERSION
import backend.indexes  # noqa: F401 — register DB indexes

# Initialize structured logging
setup_logging(json_output=not os.environ.get("DEV_MODE"), log_level="INFO")
logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from sqlalchemy import text as sa_text

    import asyncio
    from backend.redis import get_redis, close_redis
    from backend.services.cleanup import start_cleanup_loop

    should_manage_schema = settings.AUTO_APPLY_DB_SCHEMA or bool(os.environ.get("DEV_MODE"))
    if not should_manage_schema:
        logger.info("database_schema_management_skipped")
        await get_redis()
        setup_telemetry(app=app, db_engine=engine)
        cleanup_task = asyncio.create_task(start_cleanup_loop())
        yield
        logger.info("graceful_shutdown_started")
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass
        await close_redis()
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
        logger.warning("pgvector_extension_unavailable", error=str(e),
                       hint="Install pgvector for RAG features. RAG will be disabled without it.")

    # Create all tables.  If pgvector is missing, exclude the chunks table
    # (which depends on the VECTOR type) so the rest of the app still starts.
    async with engine.begin() as conn:
        if pgvector_ok:
            await conn.run_sync(Base.metadata.create_all)
        else:
            from backend.models import Chunk
            tables_without_vector = [
                t for t in Base.metadata.sorted_tables if t.name != Chunk.__tablename__
            ]
            await conn.run_sync(
                lambda sync_conn: Base.metadata.create_all(sync_conn, tables=tables_without_vector)
            )

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
                await conn.execute(sa_text(
                    f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}"
                ))
        except Exception:
            pass  # table might not exist yet either — harmless

    logger.info("database_tables_ensured", pgvector=pgvector_ok)
    await get_redis()
    setup_telemetry(app=app, db_engine=engine)
    cleanup_task = asyncio.create_task(start_cleanup_loop())
    yield
    logger.info("graceful_shutdown_started")
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    await close_redis()
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
allowed_origins = ["http://localhost:5173", "http://localhost:3000"]
frontend_url = os.environ.get("FRONTEND_URL")
if frontend_url:
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
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


async def _check_llm() -> dict:
    """Check LiteLLM proxy reachability."""
    import asyncio
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
                result = {
                    "status": "ok" if not affected_models else "degraded",
                    "health_url": health_url,
                    "warning": health_error,
                }
                if affected_models:
                    result["affected_models"] = affected_models
                result["available_models"] = available_models
                return result

            result = {
                "status": "error",
                "error": health_error,
                "health_url": health_url,
            }
            if affected_models:
                result["affected_models"] = affected_models
            if available_models:
                result["available_models"] = available_models
            if models_error:
                result["models_error"] = models_error
            return result

        if 200 <= health_result.status_code < 300:
            result = {
                "status": "ok" if not affected_models else "degraded",
                "health_url": health_url,
            }
            if affected_models:
                result["affected_models"] = affected_models
            if available_models:
                result["available_models"] = available_models
            return result

        result = {
            "status": "degraded",
            "error": f"HTTP {health_result.status_code}",
            "health_url": health_url,
        }
        if affected_models:
            result["affected_models"] = affected_models
        if available_models:
            result["available_models"] = available_models
        return result
    except Exception as e:
        result = {
            "status": "error",
            "error": str(e),
            "health_url": health_url,
        }
        if configured_models:
            result["affected_models"] = configured_models
        return result


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
            await r.ping()
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
    import asyncio
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
    """Readiness probe — returns 503 if any critical service is down."""
    from fastapi.responses import JSONResponse

    result = await health()
    if result["status"] != "ok":
        return JSONResponse(status_code=503, content=result)
    return result


# ── Frontend Error Reporting ──


class FrontendErrorReport(BaseModel):
    message: str
    stack: Optional[str] = None
    url: Optional[str] = None
    user_agent: Optional[str] = None
    component: Optional[str] = None
    request_id: Optional[str] = None
    extra: Optional[dict] = None


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


# ── WebSocket Terminal ──


def _validate_ws_session(cookie_header: str | None) -> uuid.UUID | None:
    """Extract and validate user_id from session cookie in WebSocket headers."""
    if not cookie_header:
        return None
    cookies = {}
    for item in cookie_header.split(";"):
        item = item.strip()
        if "=" in item:
            key, value = item.split("=", 1)
            cookies[key.strip()] = value.strip()

    token = cookies.get("session")
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
                    await websocket.send_json({
                        "type": "output",
                        "stdout": result.stdout,
                        "stderr": result.stderr,
                        "exit_code": result.exit_code,
                    })
                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "data": str(e),
                    })
            elif message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        logger.info("ws_disconnected", sandbox_id=sandbox_id)
    except Exception as e:
        logger.error("ws_error", sandbox_id=sandbox_id, error=str(e))
        try:
            await websocket.close()
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=True,
    )
