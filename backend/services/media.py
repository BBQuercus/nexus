import asyncio
import base64


async def get_output_file(sandbox, filename: str) -> bytes:
    """Read a file from /home/daytona/output/ and return its bytes."""
    path = f"/home/daytona/output/{filename}"
    # Use base64 encoding via process.exec since fs API may not work as expected
    result = await asyncio.to_thread(sandbox.process.exec, f"base64 -w0 '{path}'")
    b64_data = getattr(result, "result", "") or ""
    if not b64_data or getattr(result, "exit_code", 1) != 0:
        raise FileNotFoundError(f"File not found: {path}")
    return base64.b64decode(b64_data)


async def list_output_files(sandbox) -> list[str]:
    """List files in the output directory."""
    try:
        result = await asyncio.to_thread(sandbox.process.exec, "ls -1 /home/daytona/output/ 2>/dev/null")
        output = getattr(result, "result", "") or ""
        return [f for f in output.strip().split("\n") if f]
    except Exception:
        return []
