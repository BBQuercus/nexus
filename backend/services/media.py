import asyncio


async def get_output_file(sandbox, filename: str) -> bytes:
    """Read a file from /home/daytona/output/ and return its bytes."""
    path = f"/home/daytona/output/{filename}"
    content = await asyncio.to_thread(sandbox.fs.read_file, path)
    if isinstance(content, str):
        return content.encode("utf-8")
    return content


async def list_output_files(sandbox) -> list[str]:
    """List files in the output directory."""
    try:
        result = await asyncio.to_thread(
            sandbox.fs.list_files, "/home/daytona/output"
        )
        if isinstance(result, list):
            return [
                getattr(f, "name", str(f))
                for f in result
                if getattr(f, "name", str(f)) not in (".", "..")
            ]
        return []
    except Exception:
        return []
