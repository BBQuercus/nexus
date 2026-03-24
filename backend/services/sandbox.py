import asyncio
import base64
import uuid
from dataclasses import dataclass
from typing import Optional

from backend.config import settings
from backend.logging_config import get_logger

logger = get_logger("sandbox")


@dataclass
class ExecutionResult:
    stdout: str
    stderr: str
    exit_code: int


_daytona_client = None


def _get_daytona():
    """Lazily initialize Daytona client."""
    global _daytona_client
    if _daytona_client is not None:
        return _daytona_client
    if not settings.DAYTONA_API_KEY or not settings.DAYTONA_API_URL:
        return None
    from daytona_sdk import Daytona, DaytonaConfig

    _daytona_client = Daytona(
        DaytonaConfig(
            api_key=settings.DAYTONA_API_KEY,
            api_url=settings.DAYTONA_API_URL,
        )
    )
    return _daytona_client


async def create_sandbox(
    template: str = "python-data-science", labels: Optional[dict] = None
) -> object:
    """Create a new Daytona sandbox."""
    daytona = _get_daytona()
    if daytona is None:
        raise RuntimeError("Daytona SDK not configured (missing API key or URL)")

    from daytona_sdk import CreateSandboxFromSnapshotParams, CreateSandboxFromImageParams

    # Use pre-built snapshots for fast startup with packages pre-installed
    if template in ("nodejs", "react-vite"):
        params = CreateSandboxFromImageParams(
            image="node:22-slim",
            language="javascript",
            labels=labels or {},
            network_block_all=False,
        )
    else:
        # Python templates use the pre-built snapshot with data science packages
        params = CreateSandboxFromSnapshotParams(
            snapshot="nexus-ds-v4",
            language="python",
            labels=labels or {},
            network_block_all=False,
        )

    # Auto-cleanup: delete stopped sandboxes before creating a new one
    owner_id = (labels or {}).get("user_id")
    try:
        result = await asyncio.to_thread(daytona.list)
        items = list(getattr(result, 'items', result))
        for s in items:
            state = str(getattr(s, 'state', ''))
            if 'STOPPED' not in state:
                continue
            if owner_id and get_sandbox_owner_id(s) != owner_id:
                continue
            try:
                await asyncio.to_thread(daytona.delete, s)
                logger.info(f"Auto-cleaned stopped sandbox: {s.id}")
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Sandbox auto-cleanup failed: {e}")

    logger.info(f"Creating sandbox with template={template}")
    sandbox = await asyncio.to_thread(daytona.create, params)
    logger.info(f"Sandbox created: {sandbox.id}")

    # Create output directory
    await asyncio.to_thread(sandbox.process.exec, "mkdir -p /home/daytona/output")

    # Ensure document generation packages are available
    await asyncio.to_thread(
        sandbox.process.exec,
        "pip install -q python-pptx reportlab openpyxl 2>/dev/null || true"
    )

    return sandbox


async def execute_code(sandbox, language: str, code: str) -> ExecutionResult:
    """Execute code in a sandbox."""
    if language in ("python", "python3", "py"):
        b64 = base64.b64encode(code.encode("utf-8")).decode("ascii")
        await asyncio.to_thread(
            sandbox.process.exec,
            f"echo '{b64}' | base64 -d > /tmp/_nexus_exec.py"
        )
        cmd = "cd /home/daytona && python3 /tmp/_nexus_exec.py"
    elif language in ("javascript", "js", "node"):
        b64 = base64.b64encode(code.encode("utf-8")).decode("ascii")
        await asyncio.to_thread(
            sandbox.process.exec,
            f"echo '{b64}' | base64 -d > /tmp/_nexus_exec.js"
        )
        cmd = "cd /home/daytona && node /tmp/_nexus_exec.js"
    elif language in ("typescript", "ts"):
        b64 = base64.b64encode(code.encode("utf-8")).decode("ascii")
        await asyncio.to_thread(
            sandbox.process.exec,
            f"echo '{b64}' | base64 -d > /tmp/_nexus_exec.ts"
        )
        cmd = "cd /home/daytona && npx tsx /tmp/_nexus_exec.ts"
    elif language in ("bash", "sh", "shell"):
        cmd = f"cd /home/daytona && {code}"
    else:
        cmd = code

    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(sandbox.process.exec, cmd),
            timeout=120,  # 2 minute timeout
        )
    except asyncio.TimeoutError:
        logger.warning("sandbox_execution_timeout", sandbox_id=sandbox.id, language=language, code_length=len(code))
        return ExecutionResult(
            stdout="",
            stderr="Execution timed out after 2 minutes. Consider breaking your code into smaller steps or optimizing long-running operations.",
            exit_code=124,
        )

    exit_code = getattr(result, "exit_code", 0)
    stdout = getattr(result, "result", "") or ""
    # Also check artifacts.stdout
    if hasattr(result, "artifacts") and result.artifacts:
        artifacts_stdout = getattr(result.artifacts, "stdout", None)
        if artifacts_stdout and not stdout:
            stdout = artifacts_stdout

    return ExecutionResult(stdout=stdout, stderr="", exit_code=exit_code)


async def read_file(sandbox, path: str) -> str:
    """Read file content from sandbox."""
    result = await asyncio.to_thread(sandbox.process.exec, f"cat '{path}'")
    return getattr(result, "result", "") or ""


async def write_file(sandbox, path: str, content: str) -> None:
    """Write file content to sandbox."""
    b64 = base64.b64encode(content.encode("utf-8")).decode("ascii")
    await asyncio.to_thread(
        sandbox.process.exec,
        f"echo '{b64}' | base64 -d > '{path}'"
    )


async def list_files(sandbox, path: str) -> list[str]:
    """List directory contents in sandbox."""
    result = await asyncio.to_thread(sandbox.process.exec, f"ls -1 '{path}' 2>/dev/null")
    output = getattr(result, "result", "") or ""
    return [f for f in output.strip().split("\n") if f]


async def upload_file(sandbox, local_path: str, sandbox_path: str) -> None:
    """Upload a file to the sandbox."""
    with open(local_path, "rb") as f:
        data = f.read()
    b64 = base64.b64encode(data).decode("ascii")
    await asyncio.to_thread(
        sandbox.process.exec,
        f"echo '{b64}' | base64 -d > '{sandbox_path}'"
    )


async def get_sandbox(sandbox_id: str):
    """Get an existing sandbox by ID."""
    daytona = _get_daytona()
    if daytona is None:
        raise RuntimeError("Daytona SDK not configured")
    return await asyncio.to_thread(daytona.get_current_sandbox, sandbox_id)


def get_sandbox_owner_id(sandbox: object) -> str | None:
    """Best-effort extraction of the owner label from a Daytona sandbox object."""
    candidates = [
        getattr(sandbox, "labels", None),
        getattr(getattr(sandbox, "info", None), "labels", None),
        getattr(getattr(sandbox, "state", None), "labels", None),
        getattr(getattr(sandbox, "metadata", None), "labels", None),
    ]
    for labels in candidates:
        if isinstance(labels, dict):
            owner_id = labels.get("user_id")
            if owner_id:
                return str(owner_id)
    return None


async def ensure_sandbox_access(sandbox_id: str, user_id: uuid.UUID, db=None):
    """Load a sandbox and verify that the authenticated user owns it."""
    sandbox = await get_sandbox(sandbox_id)
    owner_id = get_sandbox_owner_id(sandbox)
    if owner_id:
        if owner_id != str(user_id):
            raise PermissionError("Sandbox access denied")
        return sandbox

    if db is not None:
        from sqlalchemy import select

        from backend.models import Conversation

        result = await db.execute(
            select(Conversation.user_id).where(Conversation.sandbox_id == sandbox_id).limit(1)
        )
        conversation_owner = result.scalar_one_or_none()
        if conversation_owner is not None:
            if conversation_owner != user_id:
                raise PermissionError("Sandbox access denied")
            return sandbox

    raise PermissionError("Sandbox owner could not be verified")


async def stop_sandbox(sandbox) -> None:
    daytona = _get_daytona()
    if daytona is None:
        raise RuntimeError("Daytona SDK not configured")
    await asyncio.to_thread(daytona.stop, sandbox)


async def start_sandbox(sandbox) -> None:
    daytona = _get_daytona()
    if daytona is None:
        raise RuntimeError("Daytona SDK not configured")
    await asyncio.to_thread(daytona.start, sandbox)


async def delete_sandbox(sandbox) -> None:
    daytona = _get_daytona()
    if daytona is None:
        raise RuntimeError("Daytona SDK not configured")
    await asyncio.to_thread(daytona.delete, sandbox)


async def get_preview_url(sandbox, port: int) -> str:
    url = await asyncio.to_thread(sandbox.get_preview_url, port)
    return str(url)


async def check_output_files(sandbox, known_files: set[str]) -> list[str]:
    """Check /home/daytona/output/ for new files."""
    try:
        files = await list_files(sandbox, "/home/daytona/output")
        return [f for f in files if f not in known_files]
    except Exception:
        return []
