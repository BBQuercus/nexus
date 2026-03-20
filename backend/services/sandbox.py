import asyncio
import logging
from dataclasses import dataclass
from typing import Optional

from backend.config import settings

logger = logging.getLogger(__name__)

# Template setup commands
TEMPLATE_SETUP: dict[str, str] = {
    "python-data-science": (
        "pip install -q pandas numpy matplotlib seaborn plotly "
        "scikit-learn scipy openpyxl tabulate"
    ),
    "python-general": (
        "pip install -q requests beautifulsoup4 fastapi sqlalchemy pydantic"
    ),
    "nodejs": "npm init -y && npm install express typescript tsx axios zod",
    "react-vite": (
        "npm create vite@latest app -- --template react-ts "
        "&& cd app && npm install && npm install tailwindcss"
    ),
    "blank": "",
}


@dataclass
class ExecutionResult:
    stdout: str
    stderr: str
    exit_code: int


_daytona_client = None


def _get_daytona():
    """Lazily initialize Daytona client. Returns None if not configured."""
    global _daytona_client
    if _daytona_client is not None:
        return _daytona_client
    if not settings.DAYTONA_API_KEY or not settings.DAYTONA_API_URL:
        return None
    from daytona_sdk import Daytona, DaytonaConfig

    _daytona_client = Daytona(
        DaytonaConfig(
            api_key=settings.DAYTONA_API_KEY,
            server_url=settings.DAYTONA_API_URL,
        )
    )
    return _daytona_client


async def create_sandbox(
    template: str = "python-data-science", labels: Optional[dict] = None
) -> object:
    """Create a new Daytona sandbox with the given template."""
    daytona = _get_daytona()
    if daytona is None:
        raise RuntimeError("Daytona SDK not configured (missing API key or URL)")

    from daytona_sdk import CreateSandboxFromImageParams

    language = "python"
    if template in ("nodejs", "react-vite"):
        language = "javascript"

    params = CreateSandboxFromImageParams(
        image="ubuntu:22.04",
        language=language,
        labels=labels or {},
    )

    logger.info(f"Creating sandbox with template={template}")
    sandbox = await asyncio.to_thread(daytona.create, params)
    logger.info(f"Sandbox created: {sandbox.id}")

    # Create output directory
    await asyncio.to_thread(
        sandbox.process.exec, "mkdir -p /home/daytona/output"
    )

    # Skip heavy template setup — let the LLM install what it needs on demand
    # This avoids 60+ second pip install delays on first message

    return sandbox


async def execute_code(sandbox, language: str, code: str) -> ExecutionResult:
    """Execute code in a sandbox and return the result."""
    if language in ("python", "python3", "py"):
        # Write code to sandbox file via process.exec to avoid escaping issues
        import base64
        b64 = base64.b64encode(code.encode("utf-8")).decode("ascii")
        await asyncio.to_thread(
            sandbox.process.exec,
            f"echo '{b64}' | base64 -d > /tmp/_nexus_exec.py"
        )
        cmd = "cd /home/daytona && python3 /tmp/_nexus_exec.py"
    elif language in ("javascript", "js", "node"):
        import base64
        b64 = base64.b64encode(code.encode("utf-8")).decode("ascii")
        await asyncio.to_thread(
            sandbox.process.exec,
            f"echo '{b64}' | base64 -d > /tmp/_nexus_exec.js"
        )
        cmd = "cd /home/daytona && node /tmp/_nexus_exec.js"
    elif language in ("typescript", "ts"):
        import base64
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
    stderr = ""
    if hasattr(result, "stdout"):
        stdout = result.stdout or ""
    if hasattr(result, "stderr"):
        stderr = result.stderr or ""

    return ExecutionResult(
        stdout=stdout,
        stderr=stderr,
        exit_code=exit_code,
    )


async def read_file(sandbox, path: str) -> str:
    """Read file content from sandbox."""
    content = await asyncio.to_thread(sandbox.fs.download_file, path)
    if isinstance(content, bytes):
        return content.decode("utf-8", errors="replace")
    return str(content)


async def write_file(sandbox, path: str, content: str) -> None:
    """Write file content to sandbox."""
    await asyncio.to_thread(sandbox.fs.upload_file, path, content.encode("utf-8"))


async def list_files(sandbox, path: str) -> list[str]:
    """List directory contents in sandbox."""
    result = await asyncio.to_thread(sandbox.fs.list_files, path)
    if isinstance(result, list):
        return [
            getattr(f, "name", str(f)) for f in result
        ]
    return []


async def upload_file(sandbox, local_path: str, sandbox_path: str) -> None:
    """Upload a file to the sandbox."""
    with open(local_path, "rb") as f:
        data = f.read()
    await asyncio.to_thread(sandbox.fs.upload_file, sandbox_path, data)


async def get_sandbox(sandbox_id: str):
    """Get an existing sandbox by ID."""
    daytona = _get_daytona()
    if daytona is None:
        raise RuntimeError("Daytona SDK not configured")
    return await asyncio.to_thread(daytona.get_current_sandbox, sandbox_id)


async def stop_sandbox(sandbox) -> None:
    """Stop a sandbox."""
    daytona = _get_daytona()
    if daytona is None:
        raise RuntimeError("Daytona SDK not configured")
    await asyncio.to_thread(daytona.stop, sandbox)


async def start_sandbox(sandbox) -> None:
    """Start a stopped sandbox."""
    daytona = _get_daytona()
    if daytona is None:
        raise RuntimeError("Daytona SDK not configured")
    await asyncio.to_thread(daytona.start, sandbox)


async def delete_sandbox(sandbox) -> None:
    """Delete a sandbox."""
    daytona = _get_daytona()
    if daytona is None:
        raise RuntimeError("Daytona SDK not configured")
    await asyncio.to_thread(daytona.delete, sandbox)


async def get_preview_url(sandbox, port: int) -> str:
    """Get forwarded port URL for a sandbox."""
    url = await asyncio.to_thread(sandbox.get_preview_url, port)
    return str(url)


async def check_output_files(sandbox, known_files: set[str]) -> list[str]:
    """Check /home/daytona/output/ for new files."""
    try:
        files = await list_files(sandbox, "/home/daytona/output")
        new_files = [f for f in files if f not in known_files and f not in (".", "..")]
        return new_files
    except Exception:
        return []
