import io
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user
from backend.db import get_db
from backend.services import sandbox as sandbox_service

router = APIRouter(prefix="/api/sandboxes", tags=["sandboxes"])


class CreateSandboxRequest(BaseModel):
    template: str = "python-data-science"
    labels: Optional[dict] = None


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
    try:
        labels = body.labels or {}
        labels["user_id"] = str(user_id)
        sandbox = await sandbox_service.create_sandbox(
            template=body.template, labels=labels
        )
        return {
            "id": sandbox.id,
            "template": body.template,
            "status": "running",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{sandbox_id}")
async def get_sandbox_status(
    sandbox_id: str,
    user_id: uuid.UUID = Depends(get_current_user),
):
    try:
        sandbox = await sandbox_service.get_sandbox(sandbox_id)
        return {
            "id": sandbox_id,
            "status": "running",
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{sandbox_id}/execute")
async def execute_code(
    sandbox_id: str,
    body: ExecuteCodeRequest,
    user_id: uuid.UUID = Depends(get_current_user),
):
    try:
        sandbox = await sandbox_service.get_sandbox(sandbox_id)
        result = await sandbox_service.execute_code(sandbox, body.language, body.code)
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_code,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{sandbox_id}/files")
async def list_files(
    sandbox_id: str,
    path: str = Query("/home/daytona"),
    user_id: uuid.UUID = Depends(get_current_user),
):
    try:
        sandbox = await sandbox_service.get_sandbox(sandbox_id)
        files = await sandbox_service.list_files(sandbox, path)
        return {"path": path, "files": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{sandbox_id}/files/content")
async def read_file(
    sandbox_id: str,
    path: str = Query(...),
    user_id: uuid.UUID = Depends(get_current_user),
):
    try:
        sandbox = await sandbox_service.get_sandbox(sandbox_id)
        content = await sandbox_service.read_file(sandbox, path)
        return {"path": path, "content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{sandbox_id}/files/content")
async def write_file(
    sandbox_id: str,
    body: WriteFileRequest,
    user_id: uuid.UUID = Depends(get_current_user),
):
    try:
        sandbox = await sandbox_service.get_sandbox(sandbox_id)
        await sandbox_service.write_file(sandbox, body.path, body.content)
        return {"ok": True, "path": body.path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{sandbox_id}/upload")
async def upload_files(
    sandbox_id: str,
    files: list[UploadFile] = File(...),
    path: str = Query("/home/daytona"),
    user_id: uuid.UUID = Depends(get_current_user),
):
    try:
        sandbox = await sandbox_service.get_sandbox(sandbox_id)
        uploaded = []
        for file in files:
            content = await file.read()
            file_path = f"{path}/{file.filename}"
            # Write content directly via sandbox fs
            import asyncio
            await asyncio.to_thread(
                sandbox.fs.write_file, file_path, content.decode("utf-8", errors="replace")
            )
            uploaded.append(file_path)
        return {"uploaded": uploaded}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
):
    try:
        sandbox = await sandbox_service.get_sandbox(sandbox_id)
        from backend.services.media import list_output_files
        files = await list_output_files(sandbox)
        return {"files": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{sandbox_id}/output/{filename}")
async def serve_output_file(
    sandbox_id: str,
    filename: str,
    user_id: uuid.UUID = Depends(get_current_user),
):
    try:
        sandbox = await sandbox_service.get_sandbox(sandbox_id)
        from backend.services.media import get_output_file
        content = await get_output_file(sandbox, filename)

        # Determine content type
        content_type = "application/octet-stream"
        lower = filename.lower()
        if lower.endswith(".png"):
            content_type = "image/png"
        elif lower.endswith((".jpg", ".jpeg")):
            content_type = "image/jpeg"
        elif lower.endswith(".svg"):
            content_type = "image/svg+xml"
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
            content_type = "text/html"

        return Response(content=content, media_type=content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{sandbox_id}/stop")
async def stop_sandbox(
    sandbox_id: str,
    user_id: uuid.UUID = Depends(get_current_user),
):
    try:
        sandbox = await sandbox_service.get_sandbox(sandbox_id)
        await sandbox_service.stop_sandbox(sandbox)
        return {"ok": True, "status": "stopped"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{sandbox_id}/start")
async def start_sandbox(
    sandbox_id: str,
    user_id: uuid.UUID = Depends(get_current_user),
):
    try:
        sandbox = await sandbox_service.get_sandbox(sandbox_id)
        await sandbox_service.start_sandbox(sandbox)
        return {"ok": True, "status": "running"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{sandbox_id}")
async def delete_sandbox_endpoint(
    sandbox_id: str,
    user_id: uuid.UUID = Depends(get_current_user),
):
    try:
        sandbox = await sandbox_service.get_sandbox(sandbox_id)
        await sandbox_service.delete_sandbox(sandbox)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
