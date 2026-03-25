"""Token counting, cost calculation, and usage logging."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Artifact, Conversation, Message, UsageLog
from backend.services import extraction
from backend.services import llm as llm_service
from backend.vector_db import vector_async_session


async def save_assistant_message(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    assistant_content: str,
    assistant_reasoning: str,
    enriched_tool_calls: list[dict],
    collected_images: list[dict],
    collected_charts: list[dict],
    collected_files: list[dict],
    rag_citations: list[dict],
    total_input_tokens: int,
    total_output_tokens: int,
    model: str,
    leaf_message_id: uuid.UUID | None,
) -> Message:
    """Save the assistant message to the database and return it."""
    # Compute parent_id and branch_index for the assistant message
    assistant_parent_id = leaf_message_id
    assistant_branch_index = 0
    if assistant_parent_id:
        sibling_result = await db.execute(
            select(func.count()).select_from(Message).where(Message.parent_id == assistant_parent_id)
        )
        assistant_branch_index = sibling_result.scalar() or 0

    assistant_msg_obj = Message(
        conversation_id=conversation_id,
        role="assistant",
        content=assistant_content,
        reasoning=assistant_reasoning or None,
        tool_calls=enriched_tool_calls if enriched_tool_calls else None,
        images=collected_images if collected_images else None,
        charts=collected_charts if collected_charts else None,
        attachments=([{"type": "files", "files": collected_files}] if collected_files else None),
        citations=rag_citations if rag_citations else None,
        token_count=(total_input_tokens + total_output_tokens)
        if (total_input_tokens + total_output_tokens) > 0
        else None,
        cost_usd=llm_service.calculate_cost(model, total_input_tokens, total_output_tokens)
        if total_input_tokens > 0
        else None,
        parent_id=assistant_parent_id,
        branch_index=assistant_branch_index,
    )
    db.add(assistant_msg_obj)
    await db.flush()
    return assistant_msg_obj


async def link_retrieval_logs(
    db: AsyncSession,
    retrieval_log_ids: list[uuid.UUID],
    message_id: uuid.UUID,
) -> None:
    """Link retrieval logs to the assistant message."""
    if not retrieval_log_ids:
        return
    from sqlalchemy import update as sa_update

    from backend.models import RetrievalLog

    async with vector_async_session() as vector_db:
        await vector_db.execute(
            sa_update(RetrievalLog).where(RetrievalLog.id.in_(retrieval_log_ids)).values(message_id=message_id)
        )
        await vector_db.commit()


async def save_artifacts(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    assistant_content: str,
    all_tool_calls_raw: list[dict],
    runtime_artifacts: list[dict],
) -> list:
    """Extract and save artifacts, return the list of artifact data."""
    artifacts_data = [
        *extraction.extract_artifacts(assistant_content, all_tool_calls_raw),
        *runtime_artifacts,
    ]
    for art_data in artifacts_data:
        artifact = Artifact(
            conversation_id=conversation_id,
            message_id=message_id,
            type=art_data["type"],
            label=art_data["label"],
            content=art_data["content"],
            metadata_=art_data.get("metadata"),
        )
        db.add(artifact)
    return artifacts_data


async def log_usage(
    db: AsyncSession,
    conversation: Conversation,
    conversation_id: uuid.UUID,
    model: str,
    total_input_tokens: int,
    total_output_tokens: int,
) -> None:
    """Log token usage to the database."""
    if total_input_tokens > 0 or total_output_tokens > 0:
        usage_log = UsageLog(
            user_id=conversation.user_id,
            conversation_id=conversation_id,
            model=model,
            input_tokens=total_input_tokens,
            output_tokens=total_output_tokens,
            cost_usd=llm_service.calculate_cost(model, total_input_tokens, total_output_tokens),
        )
        db.add(usage_log)
