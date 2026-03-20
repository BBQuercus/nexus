import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sse_starlette.sse import EventSourceResponse

from backend.auth import get_current_user
from backend.db import get_db
from backend.models import Artifact, Conversation, AgentPersona, Message
from backend.services.agent import run_agent_loop
from backend.services import sandbox as sandbox_service

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


# ----- Schemas -----

class CreateConversationRequest(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = "gpt-4.1-chn"
    agent_mode: str = "chat"
    agent_persona_id: Optional[uuid.UUID] = None
    sandbox_template: Optional[str] = None


class UpdateConversationRequest(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None
    agent_mode: Optional[str] = None
    agent_persona_id: Optional[uuid.UUID] = None


class SendMessageRequest(BaseModel):
    content: str
    attachments: Optional[list] = None


class FeedbackRequest(BaseModel):
    feedback: str  # "thumbs_up" or "thumbs_down"


# ----- Endpoints -----

@router.post("")
async def create_conversation(
    body: CreateConversationRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = Conversation(
        user_id=user_id,
        title=body.title,
        model=body.model,
        agent_mode=body.agent_mode,
        agent_persona_id=body.agent_persona_id,
        sandbox_template=body.sandbox_template,
    )
    db.add(conv)
    await db.flush()
    await db.commit()
    return {
        "id": str(conv.id),
        "title": conv.title,
        "model": conv.model,
        "agent_mode": conv.agent_mode,
        "sandbox_id": conv.sandbox_id,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
    }


@router.get("")
async def list_conversations(
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Conversation).where(Conversation.user_id == user_id)
    if search:
        query = query.where(Conversation.title.ilike(f"%{search}%"))
    query = query.order_by(Conversation.updated_at.desc())

    # Count total
    count_query = select(func.count()).select_from(
        query.subquery()
    )
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    query = query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    conversations = result.scalars().all()

    return {
        "conversations": [
            {
                "id": str(c.id),
                "title": c.title,
                "model": c.model,
                "agent_mode": c.agent_mode,
                "sandbox_id": c.sandbox_id,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in conversations
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id, Conversation.user_id == user_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {
        "id": str(conv.id),
        "title": conv.title,
        "model": conv.model,
        "agent_mode": conv.agent_mode,
        "agent_persona_id": str(conv.agent_persona_id) if conv.agent_persona_id else None,
        "sandbox_id": conv.sandbox_id,
        "sandbox_template": conv.sandbox_template,
        "forked_from_message_id": str(conv.forked_from_message_id) if conv.forked_from_message_id else None,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
        "messages": [
            {
                "id": str(m.id),
                "role": m.role,
                "content": m.content,
                "reasoning": m.reasoning,
                "tool_calls": m.tool_calls,
                "tool_result": m.tool_result,
                "attachments": m.attachments,
                "feedback": m.feedback,
                "token_count": m.token_count,
                "cost_usd": float(m.cost_usd) if m.cost_usd else None,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in sorted(conv.messages, key=lambda x: x.created_at)
        ],
    }


@router.patch("/{conversation_id}")
async def update_conversation(
    conversation_id: uuid.UUID,
    body: UpdateConversationRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if body.title is not None:
        conv.title = body.title
    if body.model is not None:
        conv.model = body.model
    if body.agent_mode is not None:
        conv.agent_mode = body.agent_mode
    if body.agent_persona_id is not None:
        conv.agent_persona_id = body.agent_persona_id

    await db.commit()
    return {"ok": True}


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Cleanup sandbox if exists
    if conv.sandbox_id:
        try:
            sb = await sandbox_service.get_sandbox(conv.sandbox_id)
            await sandbox_service.delete_sandbox(sb)
        except Exception:
            pass

    await db.delete(conv)
    await db.commit()
    return {"ok": True}


@router.post("/{conversation_id}/messages")
async def send_message(
    conversation_id: uuid.UUID,
    body: SendMessageRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify conversation belongs to user
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Save user message
    user_msg = Message(
        conversation_id=conversation_id,
        role="user",
        content=body.content,
        attachments=body.attachments,
    )
    db.add(user_msg)
    await db.flush()
    await db.commit()

    model = conv.model or "gpt-4.1-chn"
    mode = conv.agent_mode or "chat"

    # Load persona if set
    persona = None
    if conv.agent_persona_id:
        p_result = await db.execute(
            select(AgentPersona).where(AgentPersona.id == conv.agent_persona_id)
        )
        persona = p_result.scalar_one_or_none()

    async def event_generator():
        try:
            async for event in run_agent_loop(
                conversation_id=conversation_id,
                user_message=body.content,
                model=model,
                mode=mode,
                persona=persona,
                sandbox_id=conv.sandbox_id,
                db=db,
            ):
                yield event
        except Exception as e:
            yield {"event": "error", "data": json.dumps({"message": str(e)})}

    return EventSourceResponse(event_generator())


@router.post("/{conversation_id}/messages/{message_id}/fork")
async def fork_conversation(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get original conversation
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id, Conversation.user_id == user_id)
    )
    orig = result.scalar_one_or_none()
    if not orig:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Create new conversation
    new_conv = Conversation(
        user_id=user_id,
        title=f"Fork of {orig.title or 'Untitled'}",
        model=orig.model,
        agent_mode=orig.agent_mode,
        agent_persona_id=orig.agent_persona_id,
        sandbox_template=orig.sandbox_template,
        forked_from_message_id=message_id,
    )
    db.add(new_conv)
    await db.flush()

    # Copy messages up to and including the fork point
    for msg in sorted(orig.messages, key=lambda x: x.created_at):
        new_msg = Message(
            conversation_id=new_conv.id,
            role=msg.role,
            content=msg.content,
            reasoning=msg.reasoning,
            tool_calls=msg.tool_calls,
            tool_result=msg.tool_result,
            attachments=msg.attachments,
        )
        db.add(new_msg)
        if msg.id == message_id:
            break

    await db.commit()
    return {
        "id": str(new_conv.id),
        "title": new_conv.title,
        "forked_from_message_id": str(message_id),
    }


@router.post("/{conversation_id}/messages/{message_id}/feedback")
async def submit_feedback(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    body: FeedbackRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify ownership
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    await db.execute(
        update(Message)
        .where(Message.id == message_id, Message.conversation_id == conversation_id)
        .values(feedback=body.feedback)
    )
    await db.commit()
    return {"ok": True}


@router.post("/{conversation_id}/messages/{message_id}/regenerate")
async def regenerate_message(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify ownership
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Get the message to regenerate and the preceding user message
    msg_result = await db.execute(
        select(Message).where(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
        )
    )
    target_msg = msg_result.scalar_one_or_none()
    if not target_msg or target_msg.role != "assistant":
        raise HTTPException(status_code=400, detail="Can only regenerate assistant messages")

    # Find the user message before this one
    prev_msgs = await db.execute(
        select(Message)
        .where(
            Message.conversation_id == conversation_id,
            Message.created_at < target_msg.created_at,
            Message.role == "user",
        )
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    user_msg = prev_msgs.scalar_one_or_none()
    if not user_msg:
        raise HTTPException(status_code=400, detail="No preceding user message found")

    # Delete the old assistant message and any messages after it
    await db.execute(
        delete(Artifact).where(Artifact.message_id == message_id)
    )
    await db.execute(
        delete(Message).where(
            Message.conversation_id == conversation_id,
            Message.created_at >= target_msg.created_at,
        )
    )
    await db.flush()

    model = conv.model or "gpt-4.1-chn"
    mode = conv.agent_mode or "chat"

    persona = None
    if conv.agent_persona_id:
        p_result = await db.execute(
            select(AgentPersona).where(AgentPersona.id == conv.agent_persona_id)
        )
        persona = p_result.scalar_one_or_none()

    async def event_generator():
        try:
            async for event in run_agent_loop(
                conversation_id=conversation_id,
                user_message=user_msg.content,
                model=model,
                mode=mode,
                persona=persona,
                sandbox_id=conv.sandbox_id,
                db=db,
            ):
                yield event
        except Exception as e:
            yield {"event": "error", "data": json.dumps({"message": str(e)})}

    return EventSourceResponse(event_generator())


@router.get("/{conversation_id}/artifacts")
async def list_artifacts(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify ownership
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    artifacts_result = await db.execute(
        select(Artifact)
        .where(Artifact.conversation_id == conversation_id)
        .order_by(Artifact.created_at)
    )
    artifacts = artifacts_result.scalars().all()

    return [
        {
            "id": str(a.id),
            "type": a.type,
            "label": a.label,
            "content": a.content,
            "metadata": a.metadata_,
            "pinned": a.pinned,
            "message_id": str(a.message_id),
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in artifacts
    ]


# Artifact management (not scoped under conversation)
artifact_router = APIRouter(prefix="/api/artifacts", tags=["artifacts"])


@artifact_router.delete("/{artifact_id}")
async def delete_artifact(
    artifact_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Artifact)
        .join(Conversation)
        .where(Artifact.id == artifact_id, Conversation.user_id == user_id)
    )
    artifact = result.scalar_one_or_none()
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    await db.delete(artifact)
    await db.commit()
    return {"ok": True}


class UpdateArtifactRequest(BaseModel):
    pinned: Optional[bool] = None
    label: Optional[str] = None


@artifact_router.patch("/{artifact_id}")
async def update_artifact(
    artifact_id: uuid.UUID,
    body: UpdateArtifactRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Artifact)
        .join(Conversation)
        .where(Artifact.id == artifact_id, Conversation.user_id == user_id)
    )
    artifact = result.scalar_one_or_none()
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    if body.pinned is not None:
        artifact.pinned = body.pinned
    if body.label is not None:
        artifact.label = body.label

    await db.commit()
    return {"ok": True}
