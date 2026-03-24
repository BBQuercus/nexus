import base64
import uuid

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from backend.auth import get_current_user
from backend.config import settings

router = APIRouter(prefix="/api/media", tags=["media"])


def _litellm_v1_url(path: str) -> str:
    return f"{settings.LITE_LLM_URL.rstrip('/')}/v1{path}"


class AudioFromTextRequest(BaseModel):
    text: str
    model: str = "azure_ai/gpt-audio-1.5"
    voice: str = "alloy"
    format: str = "wav"


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    model: str = Form("azure/whisper-1"),
    user_id: uuid.UUID = Depends(get_current_user),
):
    del user_id
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="No audio file uploaded")

    files = {
        "file": (file.filename or "recording.webm", data, file.content_type or "audio/webm"),
    }
    form = {"model": model}
    headers = {"Authorization": f"Bearer {settings.LITE_LLM_API_KEY}"}

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(_litellm_v1_url("/audio/transcriptions"), data=form, files=files, headers=headers)
            response.raise_for_status()
            payload = response.json()
            return {"text": payload.get("text", ""), "model": model}
    except httpx.HTTPStatusError as e:
        detail = e.response.text or e.response.reason_phrase or "LiteLLM transcription request failed"
        raise HTTPException(status_code=e.response.status_code, detail=f"Transcription failed: {detail}") from e
    except httpx.TimeoutException as e:
        raise HTTPException(status_code=504, detail=f"Transcription timed out: {type(e).__name__}") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription error: {type(e).__name__}: {e!r}") from e


@router.post("/speak")
async def speak_text(
    body: AudioFromTextRequest,
    user_id: uuid.UUID = Depends(get_current_user),
):
    del user_id
    payload = {
        "model": body.model,
        "messages": [
            {
                "role": "system",
                "content": "Read the following text aloud exactly as written. Do not add, remove, or change any words. Do not add commentary, greetings, or sign-offs.",
            },
            {"role": "user", "content": body.text},
        ],
        "modalities": ["text", "audio"],
        "audio": {"voice": body.voice, "format": body.format},
        "max_completion_tokens": 4096,
    }
    headers = {
        "Authorization": f"Bearer {settings.LITE_LLM_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(_litellm_v1_url("/chat/completions"), json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as e:
        detail = e.response.text or e.response.reason_phrase or "LiteLLM audio generation request failed"
        raise HTTPException(status_code=e.response.status_code, detail=f"Audio generation failed: {detail}") from e
    except httpx.TimeoutException as e:
        raise HTTPException(status_code=504, detail=f"Audio generation timed out: {type(e).__name__}") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio generation error: {type(e).__name__}: {e!r}") from e

    try:
        audio = data["choices"][0]["message"]["audio"]
        audio_bytes = base64.b64decode(audio["data"])
        ext = body.format.lower()
        media_type = "audio/wav" if ext == "wav" else f"audio/{ext}"
        return Response(
            content=audio_bytes,
            media_type=media_type,
            headers={"Content-Disposition": f'inline; filename="speech.{ext}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio parsing error: {e}") from e
