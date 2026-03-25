import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user
from backend.db import get_db
from backend.rate_limit import check_rate_limit
from backend.services import sandbox as sandbox_service
from backend.services.audit import AuditAction, record_audit_event

router = APIRouter(prefix="/api/sandboxes", tags=["sandboxes"])


class CreateSandboxRequest(BaseModel):
    template: str = "python-data-science"
    labels: dict | None = None


class ExecuteCodeRequest(BaseModel):
    language: str = "python"
    code: str


class WriteFileRequest(BaseModel):
    path: str
    content: str


@router.post("")
async def create_sandbox(
    body: CreateSandboxRequest,
    user_id: uuid.UUID = Depends(get_current_user),
):
    # Rate limit: 10 sandbox creations per minute per user
    await check_rate_limit(str(user_id), limit=10, window_seconds=60, category="sandbox")
    try:
        labels = body.labels or {}
        labels["user_id"] = str(user_id)
        sandbox = await sandbox_service.create_sandbox(template=body.template, labels=labels)
        await record_audit_event(
            AuditAction.SANDBOX_CREATED, actor_id=str(user_id), resource_type="sandbox", resource_id=sandbox.id
        )
        return {
            "id": sandbox.id,
            "template": body.template,
            "status": "running",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/{sandbox_id}")
async def get_sandbox_status(
    sandbox_id: str,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        await sandbox_service.ensure_sandbox_access(sandbox_id, user_id, db)
        return {
            "id": sandbox_id,
            "status": "running",
        }
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{sandbox_id}/execute")
async def execute_code(
    sandbox_id: str,
    body: ExecuteCodeRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        sandbox = await sandbox_service.ensure_sandbox_access(sandbox_id, user_id, db)
        result = await sandbox_service.execute_code(sandbox, body.language, body.code)
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_code,
        }
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/{sandbox_id}/files")
async def list_files(
    sandbox_id: str,
    path: str = Query("/home/daytona"),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        sandbox = await sandbox_service.ensure_sandbox_access(sandbox_id, user_id, db)
        files = await sandbox_service.list_files(sandbox, path)
        return {"path": path, "files": files}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/{sandbox_id}/files/content")
async def read_file(
    sandbox_id: str,
    path: str = Query(...),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        sandbox = await sandbox_service.ensure_sandbox_access(sandbox_id, user_id, db)
        content = await sandbox_service.read_file(sandbox, path)
        return {"path": path, "content": content}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.put("/{sandbox_id}/files/content")
async def write_file(
    sandbox_id: str,
    body: WriteFileRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        sandbox = await sandbox_service.ensure_sandbox_access(sandbox_id, user_id, db)
        await sandbox_service.write_file(sandbox, body.path, body.content)
        return {"ok": True, "path": body.path}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB per file
MAX_TOTAL_UPLOAD_SIZE = 200 * 1024 * 1024  # 200MB total
BLOCKED_EXTENSIONS = {".exe", ".bat", ".cmd", ".sh"}


@router.post("/{sandbox_id}/upload")
async def upload_files(
    sandbox_id: str,
    files: list[UploadFile] = File(...),
    path: str = Query("/home/daytona"),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        sandbox = await sandbox_service.ensure_sandbox_access(sandbox_id, user_id, db)
        uploaded = []
        total_size = 0
        for file in files:
            # Check blocked extensions
            filename_lower = (file.filename or "").lower()
            for ext in BLOCKED_EXTENSIONS:
                if filename_lower.endswith(ext):
                    raise HTTPException(
                        status_code=400,
                        detail=f"File type '{ext}' is not allowed: {file.filename}",
                    )

            content = await file.read()

            # Check individual file size
            if len(content) > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"File '{file.filename}' exceeds max size of 50MB ({len(content)} bytes).",
                )

            # Check total upload size
            total_size += len(content)
            if total_size > MAX_TOTAL_UPLOAD_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail="Total upload size exceeds 200MB limit.",
                )

            file_path = f"{path}/{file.filename}"
            # Write content directly via sandbox fs
            import asyncio

            await asyncio.to_thread(sandbox.fs.write_file, file_path, content.decode("utf-8", errors="replace"))
            uploaded.append(file_path)
        return {"uploaded": uploaded}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/{sandbox_id}/download")
async def download_sandbox(
    sandbox_id: str,
    user_id: uuid.UUID = Depends(get_current_user),
):
    # Placeholder — not yet implemented
    raise HTTPException(status_code=501, detail="Download as ZIP not yet implemented")


@router.get("/{sandbox_id}/output")
async def list_output_files(
    sandbox_id: str,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        sandbox = await sandbox_service.ensure_sandbox_access(sandbox_id, user_id, db)
        from backend.services.media import list_output_files

        files = await list_output_files(sandbox)
        return {"files": files}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/{sandbox_id}/output/{filename}")
async def serve_output_file(
    sandbox_id: str,
    filename: str,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        sandbox = await sandbox_service.ensure_sandbox_access(sandbox_id, user_id, db)
        from backend.services.media import get_output_file

        content = await get_output_file(sandbox, filename)

        # Determine content type
        content_type = "application/octet-stream"
        headers = {}
        lower = filename.lower()
        if lower.endswith(".png"):
            content_type = "image/png"
        elif lower.endswith((".jpg", ".jpeg")):
            content_type = "image/jpeg"
        elif lower.endswith(".svg"):
            headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        elif lower.endswith(".gif"):
            content_type = "image/gif"
        elif lower.endswith(".webp"):
            content_type = "image/webp"
        elif lower.endswith(".pdf"):
            content_type = "application/pdf"
        elif lower.endswith(".csv"):
            content_type = "text/csv"
        elif lower.endswith(".json"):
            content_type = "application/json"
        elif lower.endswith((".txt", ".log", ".md")):
            content_type = "text/plain"
        elif lower.endswith((".html", ".htm")):
            headers["Content-Disposition"] = f'attachment; filename="{filename}"'

        return Response(content=content, media_type=content_type, headers=headers)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/{sandbox_id}/stop")
async def stop_sandbox(
    sandbox_id: str,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        sandbox = await sandbox_service.ensure_sandbox_access(sandbox_id, user_id, db)
        await sandbox_service.stop_sandbox(sandbox)
        return {"ok": True, "status": "stopped"}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/{sandbox_id}/start")
async def start_sandbox(
    sandbox_id: str,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        sandbox = await sandbox_service.ensure_sandbox_access(sandbox_id, user_id, db)
        await sandbox_service.start_sandbox(sandbox)
        return {"ok": True, "status": "running"}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.delete("/{sandbox_id}")
async def delete_sandbox_endpoint(
    sandbox_id: str,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        sandbox = await sandbox_service.ensure_sandbox_access(sandbox_id, user_id, db)
        await sandbox_service.delete_sandbox(sandbox)
        return {"ok": True}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
