import asyncio
import base64
import logging
from dataclasses import dataclass
from typing import Optional

from backend.config import settings

logger = logging.getLogger(__name__)


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
        )
    else:
        # Python templates use the pre-built snapshot with data science packages
        params = CreateSandboxFromSnapshotParams(
            snapshot="nexus-ds-v4",
            language="python",
            labels=labels or {},
        )

    logger.info(f"Creating sandbox with template={template}")
    sandbox = await asyncio.to_thread(daytona.create, params)
    logger.info(f"Sandbox created: {sandbox.id}")

    # Create output directory
    await asyncio.to_thread(sandbox.process.exec, "mkdir -p /home/daytona/output")

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

    result = await asyncio.to_thread(sandbox.process.exec, cmd)

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
