import json
import logging
import os
import uuid
from contextlib import asynccontextmanager

import jwt
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from backend.auth import router as auth_router
from backend.config import settings
from backend.db import Base, engine
from backend.routers.agents import router as agents_router
from backend.routers.chat import artifact_router, router as chat_router
from backend.routers.sandboxes import router as sandboxes_router
from backend.routers.tts import router as tts_router
from backend.routers.users import router as users_router
from backend.services import sandbox as sandbox_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables if needed (dev convenience)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ensured")

    yield

    # Shutdown: dispose engine
    await engine.dispose()
    logger.info("Database engine disposed")


app = FastAPI(
    title="Nexus",
    description="AI Agent Workspace with Sandboxed Code Execution",
    version="0.1.0",
    lifespan=lifespan,
)

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
)

# Include routers
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(artifact_router)
app.include_router(sandboxes_router)
app.include_router(agents_router)
app.include_router(users_router)
app.include_router(tts_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


def _validate_ws_session(cookie_header: str | None) -> uuid.UUID | None:
    """Extract and validate user_id from session cookie in WebSocket headers."""
    if not cookie_header:
        return None
    # Parse cookies from header
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
async def sandbox_terminal(websocket: WebSocket, sandbox_id: str):
    """WebSocket endpoint for terminal streaming to a sandbox."""
    # Validate session
    cookie_header = websocket.headers.get("cookie")
    user_id = _validate_ws_session(cookie_header)
    if not user_id:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    logger.info(f"Terminal WebSocket connected: sandbox={sandbox_id}, user={user_id}")

    try:
        sandbox = await sandbox_service.get_sandbox(sandbox_id)
    except Exception as e:
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
        logger.info(f"Terminal WebSocket disconnected: sandbox={sandbox_id}")
    except Exception as e:
        logger.error(f"Terminal WebSocket error: {e}")
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
