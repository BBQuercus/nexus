import uuid
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from backend.auth import get_current_user
from backend.config import settings

router = APIRouter(prefix="/api/tts", tags=["tts"])


class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = "en-US-AvaMultilingualNeural"


@router.post("")
async def text_to_speech(
    body: TTSRequest,
    user_id: uuid.UUID = Depends(get_current_user),
):
    if not settings.AZURE_SPEECH_KEY:
        raise HTTPException(status_code=501, detail="TTS not configured (AZURE_SPEECH_KEY missing)")

    tts_url = (
        f"https://{settings.AZURE_SPEECH_LOCATION}.tts.speech.microsoft.com"
        f"/cognitiveservices/v1"
    )

    ssml = f"""<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
    <voice name='{body.voice}'>{body.text}</voice>
</speak>"""

    headers = {
        "Ocp-Apim-Subscription-Key": settings.AZURE_SPEECH_KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(tts_url, content=ssml, headers=headers)
            response.raise_for_status()
            return Response(
                content=response.content,
                media_type="audio/mpeg",
                headers={"Content-Disposition": "inline; filename=speech.mp3"},
            )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Azure TTS error: {e.response.text}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS error: {str(e)}")
