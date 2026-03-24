"""Conversation history building and message formatting for LLM."""

import json
import uuid
from typing import Any, Optional

from sqlalchemy import func, select, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Conversation, Message
from backend.prompts.system import build_system_prompt
from backend.prompts.tools import get_tools_for_mode


async def load_conversation_messages(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    leaf_message_id: Optional[uuid.UUID],
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
            result = await db.execute(
                select(Message).where(Message.id.in_(path_ids)).order_by(Message.created_at)
            )
            return list(result.scalars().all())
        return []
    else:
        result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at)
        )
        return list(result.scalars().all())


async def detect_knowledge(
    db: AsyncSession,
    conversation: Conversation,
    conversation_id: uuid.UUID,
    persona: Optional[object],
) -> tuple[bool, list[uuid.UUID]]:
    """Determine if knowledge bases/documents are available.

    Returns (has_knowledge, knowledge_base_ids).
    """
    knowledge_base_ids: list[uuid.UUID] = []

    # Check conversation-level KB attachments
    if conversation.knowledge_base_ids:
        knowledge_base_ids.extend(
            uuid.UUID(kid) for kid in conversation.knowledge_base_ids if kid
        )

    # Check agent persona KB attachments
    if persona and hasattr(persona, "knowledge_base_ids") and persona.knowledge_base_ids:
        knowledge_base_ids.extend(
            uuid.UUID(kid) for kid in persona.knowledge_base_ids if kid
        )

    # Check if conversation has any scoped documents
    from backend.models import Document as DocumentModel
    conv_doc_count = await db.scalar(
        select(func.count()).select_from(DocumentModel).where(
            DocumentModel.conversation_id == conversation_id
        )
    )
    has_knowledge = bool(knowledge_base_ids) or (conv_doc_count or 0) > 0
    return has_knowledge, knowledge_base_ids


def build_llm_messages(
    existing_messages: list[Message],
    system_prompt: str,
    user_message: str,
    leaf_message_id: Optional[uuid.UUID],
) -> list[dict]:
    """Build the message list for the LLM from DB messages."""
    llm_messages: list[dict] = [{"role": "system", "content": system_prompt}]

    for msg in existing_messages:
        entry: dict[str, Any] = {"role": msg.role, "content": msg.content or ""}
        if msg.tool_calls and msg.role == "assistant":
            entry["tool_calls"] = msg.tool_calls
            if not entry["content"]:
                entry.pop("content", None)
        if msg.role == "tool" and msg.tool_result:
            entry["content"] = json.dumps(msg.tool_result) if isinstance(msg.tool_result, dict) else str(msg.tool_result)
            entry["tool_call_id"] = msg.tool_result.get("tool_call_id", "") if isinstance(msg.tool_result, dict) else ""
        llm_messages.append(entry)

    # Only append user message if it's not already in the path
    if not leaf_message_id:
        llm_messages.append({"role": "user", "content": user_message})
    elif user_message and llm_messages:
        # If user_message contains injected context (from @mentions),
        # replace the last user message content with the enriched version
        last_user = llm_messages[-1]
        if last_user.get("role") == "user" and last_user.get("content") != user_message:
            last_user["content"] = user_message

    return llm_messages
