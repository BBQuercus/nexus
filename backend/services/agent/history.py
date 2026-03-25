"""Conversation history building and message formatting for LLM."""

import json
import re
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Conversation, Message


async def load_conversation_messages(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    leaf_message_id: uuid.UUID | None,
) -> list[Message]:
    """Load conversation messages, either the full list or the path to a leaf."""
    if leaf_message_id:
        path_result = await db.execute(
            sa_text("""
                WITH RECURSIVE path AS (
                    SELECT * FROM messages WHERE id = :leaf_id
                    UNION ALL
                    SELECT m.* FROM messages m JOIN path p ON m.id = p.parent_id
                )
                SELECT id FROM path
            """),
            {"leaf_id": str(leaf_message_id)},
        )
        path_ids = [row[0] for row in path_result.fetchall()]
        if path_ids:
            result = await db.execute(select(Message).where(Message.id.in_(path_ids)).order_by(Message.created_at))
            return list(result.scalars().all())
        return []
    else:
        result = await db.execute(
            select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at)
        )
        return list(result.scalars().all())


async def detect_knowledge(
    db: AsyncSession,
    conversation: Conversation,
    conversation_id: uuid.UUID,
    persona: object | None,
) -> tuple[bool, list[uuid.UUID]]:
    """Determine if knowledge bases/documents are available.

    Returns (has_knowledge, knowledge_base_ids).
    """
    knowledge_base_ids: list[uuid.UUID] = []

    # Check conversation-level KB attachments
    if conversation.knowledge_base_ids:
        knowledge_base_ids.extend(uuid.UUID(kid) for kid in conversation.knowledge_base_ids if kid)

    # Check agent persona KB attachments
    if persona and hasattr(persona, "knowledge_base_ids") and persona.knowledge_base_ids:
        knowledge_base_ids.extend(uuid.UUID(kid) for kid in persona.knowledge_base_ids if kid)

    # Check if conversation has any scoped documents
    from backend.models import Document as DocumentModel

    conv_doc_count = await db.scalar(
        select(func.count()).select_from(DocumentModel).where(DocumentModel.conversation_id == conversation_id)
    )
    has_knowledge = bool(knowledge_base_ids) or (conv_doc_count or 0) > 0
    return has_knowledge, knowledge_base_ids


_VALID_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}


def _build_multimodal_content(text: str, images: list[dict]) -> list[dict]:
    """Build a multimodal content array with text and image_url blocks (OpenAI vision format)."""
    parts: list[dict] = []
    if text:
        parts.append({"type": "text", "text": text})
    for img in images:
        url = img.get("url", "")
        if not url:
            continue
        # Parse data URL to extract and validate media type
        m = re.match(r"data:([^;,]+)", url)
        media_type = m.group(1) if m else "image/png"
        # Normalize media types (e.g. image/jpg → image/jpeg)
        if media_type == "image/jpg":
            media_type = "image/jpeg"
        if media_type not in _VALID_IMAGE_TYPES:
            media_type = "image/png"
        # Reconstruct clean data URL with validated media type
        b64_match = re.search(r"base64,(.+)", url)
        clean_url = f"data:{media_type};base64,{b64_match.group(1)}" if b64_match else url
        parts.append({"type": "image_url", "image_url": {"url": clean_url}})
    return parts


def build_llm_messages(
    existing_messages: list[Message],
    system_prompt: str,
    user_message: str,
    leaf_message_id: uuid.UUID | None,
) -> list[dict]:
    """Build the message list for the LLM from DB messages."""
    llm_messages: list[dict] = [{"role": "system", "content": system_prompt}]

    for msg in existing_messages:
        text_content = msg.content or ""

        # Include images as multimodal content for user messages
        if msg.role == "user" and msg.images and isinstance(msg.images, list) and len(msg.images) > 0:
            entry: dict[str, Any] = {
                "role": "user",
                "content": _build_multimodal_content(text_content, msg.images),
            }
        else:
            entry = {"role": msg.role, "content": text_content}

        if msg.tool_calls and msg.role == "assistant":
            entry["tool_calls"] = msg.tool_calls
            if not entry.get("content"):
                entry.pop("content", None)
        if msg.role == "tool" and msg.tool_result:
            entry["content"] = (
                json.dumps(msg.tool_result) if isinstance(msg.tool_result, dict) else str(msg.tool_result)
            )
            entry["tool_call_id"] = msg.tool_result.get("tool_call_id", "") if isinstance(msg.tool_result, dict) else ""
        llm_messages.append(entry)

    # Only append user message if it's not already in the path
    if not leaf_message_id:
        llm_messages.append({"role": "user", "content": user_message})
    elif user_message and llm_messages:
        # If user_message contains injected context (from @mentions),
        # replace the last user message content with the enriched version
        last_user = llm_messages[-1]
        if last_user.get("role") == "user":
            current = last_user.get("content")
            # Handle both string and multimodal content
            if isinstance(current, str) and current != user_message:
                last_user["content"] = user_message
            elif isinstance(current, list):
                # Replace the text part while keeping images
                for part in current:
                    if isinstance(part, dict) and part.get("type") == "text":
                        part["text"] = user_message
                        break

    return llm_messages
