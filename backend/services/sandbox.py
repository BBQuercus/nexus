import asyncio
from dataclasses import dataclass
from typing import Optional

from backend.config import settings

# Template setup commands
TEMPLATE_SETUP: dict[str, str] = {
    "python-data-science": (
        "pip install pandas numpy matplotlib seaborn plotly "
        "scikit-learn scipy openpyxl tabulate"
    ),
    "python-general": (
        "pip install requests beautifulsoup4 fastapi sqlalchemy pydantic"
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


def _get_daytona():
    """Lazily initialize Daytona client. Returns None if not configured."""
    if not settings.DAYTONA_API_KEY or not settings.DAYTONA_API_URL:
        return None
    from daytona_sdk import Daytona, DaytonaConfig

    return Daytona(
        DaytonaConfig(
            api_key=settings.DAYTONA_API_KEY,
            server_url=settings.DAYTONA_API_URL,
        )
    )


async def create_sandbox(
    template: str = "python-data-science", labels: Optional[dict] = None
) -> object:
    """Create a new Daytona sandbox with the given template."""
    daytona = _get_daytona()
    if daytona is None:
        raise RuntimeError("Daytona SDK not configured (missing API key or URL)")

    from daytona_sdk import CreateSandboxParams

    params = CreateSandboxParams(
        labels=labels or {},
    )

    sandbox = await asyncio.to_thread(daytona.create, params)

    # Create output directory
    await asyncio.to_thread(
        sandbox.process.exec, "mkdir -p /home/daytona/output"
    )

    # Run template setup if applicable
    setup_cmd = TEMPLATE_SETUP.get(template, "")
    if setup_cmd:
        await asyncio.to_thread(sandbox.process.exec, setup_cmd)

    return sandbox


async def execute_code(sandbox, language: str, code: str) -> ExecutionResult:
    """Execute code in a sandbox and return the result."""
    if language in ("python", "python3", "py"):
        # Write code to a temp file and execute
        escaped_code = code.replace("'", "'\\''")
        cmd = f"python3 -c '{escaped_code}'"
    elif language in ("javascript", "js", "node"):
        escaped_code = code.replace("'", "'\\''")
        cmd = f"node -e '{escaped_code}'"
    elif language in ("typescript", "ts"):
        escaped_code = code.replace("'", "'\\''")
        cmd = f"npx tsx -e '{escaped_code}'"
    elif language in ("bash", "sh", "shell"):
        cmd = code
    else:
        cmd = code

    result = await asyncio.to_thread(sandbox.process.exec, cmd)

    exit_code = getattr(result, "exit_code", 0)
    stdout = getattr(result, "result", "") or ""
    stderr = ""
    # Some SDK versions use different attributes
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
    result = await asyncio.to_thread(sandbox.fs.read_file, path)
    return result


async def write_file(sandbox, path: str, content: str) -> None:
    """Write file content to sandbox."""
    await asyncio.to_thread(sandbox.fs.write_file, path, content)


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
    await asyncio.to_thread(sandbox.fs.upload_file, local_path, sandbox_path)


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
    result = await asyncio.to_thread(sandbox.get_preview_url, port)
    return result


async def check_output_files(sandbox, known_files: set[str]) -> list[str]:
    """Check /home/daytona/output/ for new files."""
    try:
        files = await list_files(sandbox, "/home/daytona/output")
        new_files = [f for f in files if f not in known_files and f not in (".", "..")]
        return new_files
    except Exception:
        return []
