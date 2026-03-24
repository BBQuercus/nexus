import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import jwt
from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user, router as auth_router
from backend.config import settings
from backend.db import Base, engine, get_db
from backend.logging_config import get_logger, setup_logging
from backend.middleware import GlobalExceptionMiddleware, RequestIdMiddleware
from backend.models import FrontendError
from backend.routers.agents import router as agents_router
from backend.routers.chat import artifact_router, router as chat_router
from backend.routers.sandboxes import router as sandboxes_router
from backend.routers.tts import router as tts_router
from backend.routers.users import router as users_router
from backend.services import sandbox as sandbox_service

# Initialize structured logging
setup_logging(json_output=not os.environ.get("DEV_MODE"), log_level="INFO")
logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("startup", event="database_tables_ensured")
    yield
    await engine.dispose()
    logger.info("shutdown", event="database_engine_disposed")


app = FastAPI(
    title="Nexus",
    description="AI Agent Workspace with Sandboxed Code Execution",
    version="0.1.0",
    lifespan=lifespan,
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

# RequestIdMiddleware generates request IDs and binds them to log context
app.add_middleware(RequestIdMiddleware)

# Include routers
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(artifact_router)
app.include_router(sandboxes_router)
app.include_router(agents_router)
app.include_router(users_router)
app.include_router(tts_router)


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


async def _check_llm() -> dict:
    """Check LiteLLM proxy reachability."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.LITE_LLM_URL}/health")
            if resp.status_code < 500:
                return {"status": "ok"}
            return {"status": "degraded", "error": f"HTTP {resp.status_code}"}
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
    db_check, llm_check, daytona_check = await asyncio.gather(
        _check_db(), _check_llm(), _check_daytona()
    )
    latency_ms = round((time.monotonic() - start) * 1000, 1)

    checks = {"db": db_check, "llm": llm_check, "daytona": daytona_check}
    all_ok = all(c["status"] in ("ok", "unconfigured") for c in checks.values())

    return {
        "status": "ok" if all_ok else "degraded",
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
        sandbox = await sandbox_service.get_sandbox(sandbox_id)
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
