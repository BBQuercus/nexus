import json
import uuid
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import delete, func, select, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sse_starlette.sse import EventSourceResponse

from backend.auth import get_current_user
from backend.db import get_db
from backend.models import Artifact, Conversation, AgentPersona, Message
from backend.rate_limit import chat_limiter
from backend.services.agent import run_agent_loop, run_multi_agent_loop
from backend.services import sandbox as sandbox_service
from backend.services import llm as llm_service
from backend.services.messages import extract_message_files
from backend.config import settings

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


# ----- Schemas -----

class CreateConversationRequest(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = "gpt-4.1-chn"
    agent_mode: str = "code"
    agent_persona_id: Optional[uuid.UUID] = None
    sandbox_template: Optional[str] = None
    knowledge_base_ids: Optional[list[uuid.UUID]] = None


class UpdateConversationRequest(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None
    agent_mode: Optional[str] = None
    agent_persona_id: Optional[uuid.UUID] = None


class SendMessageRequest(BaseModel):
    content: str
    attachments: Optional[list] = None
    model: Optional[str] = None
    mode: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    num_responses: Optional[int] = 1  # 1-5 parallel responses
    context_conversation_ids: Optional[list[uuid.UUID]] = None  # @mentioned conversations
    agent_persona_id: Optional[uuid.UUID] = None  # Override persona for this message
    knowledge_base_ids: Optional[list[uuid.UUID]] = None  # Attach KBs for RAG


class GenerateImageRequest(BaseModel):
    prompt: str
    model: str = "gpt-image-1.5-swc"
    size: str = "1024x1024"


class SwitchBranchRequest(BaseModel):
    leaf_id: uuid.UUID


# ----- Helpers -----

async def get_active_path(db: AsyncSession, leaf_id: uuid.UUID) -> list[Message]:
    """Walk parent_id chain from leaf to root, return messages in root-to-leaf order."""
    result = await db.execute(
        sa_text("""
            WITH RECURSIVE path AS (
                SELECT * FROM messages WHERE id = :leaf_id
                UNION ALL
                SELECT m.* FROM messages m JOIN path p ON m.id = p.parent_id
            )
            SELECT id FROM path
        """),
        {"leaf_id": str(leaf_id)},
    )
    path_ids = [row[0] for row in result.fetchall()]
    if not path_ids:
        return []
    # Load full Message objects in chronological order
    msg_result = await db.execute(
        select(Message).where(Message.id.in_(path_ids)).order_by(Message.created_at)
    )
    return list(msg_result.scalars().all())


def _serialize_message(m: Message) -> dict:
    return {
        "id": str(m.id),
        "role": m.role,
        "content": m.content,
        "reasoning": m.reasoning,
        "tool_calls": m.tool_calls,
        "tool_result": m.tool_result,
        "images": m.images,
        "files": extract_message_files(m.attachments),
        "attachments": m.attachments,
        "citations": m.citations,
        "feedback": m.feedback,
        "token_count": m.token_count,
        "cost_usd": float(m.cost_usd) if m.cost_usd else None,
        "parent_id": str(m.parent_id) if m.parent_id else None,
        "branch_index": m.branch_index,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


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
        knowledge_base_ids=[str(kid) for kid in body.knowledge_base_ids] if body.knowledge_base_ids else None,
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
        .where(Conversation.id == conversation_id, Conversation.user_id == user_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Return only active path messages (or all if no active_leaf_id set yet)
    if conv.active_leaf_id:
        path_messages = await get_active_path(db, conv.active_leaf_id)
    else:
        msg_result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at)
        )
        path_messages = list(msg_result.scalars().all())

    return {
        "id": str(conv.id),
        "title": conv.title,
        "model": conv.model,
        "agent_mode": conv.agent_mode,
        "agent_persona_id": str(conv.agent_persona_id) if conv.agent_persona_id else None,
        "sandbox_id": conv.sandbox_id,
        "sandbox_template": conv.sandbox_template,
        "active_leaf_id": str(conv.active_leaf_id) if conv.active_leaf_id else None,
        "forked_from_message_id": str(conv.forked_from_message_id) if conv.forked_from_message_id else None,
        "knowledge_base_ids": conv.knowledge_base_ids,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
        "messages": [_serialize_message(m) for m in path_messages],
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

    # Null out active_leaf_id before deleting to avoid FK cycle
    # (active_leaf_id -> messages -> conversation cascade conflict)
    conv.active_leaf_id = None
    conv.forked_from_message_id = None
    await db.flush()

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
    # Rate limit: 60 requests per minute per user
    chat_limiter.check(str(user_id), limit=60, window_seconds=60)

    # Verify conversation belongs to user
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Determine parent_id for the new message
    parent_id = body.parent_id
    if parent_id is None:
        parent_id = conv.active_leaf_id  # continue the active path

    # Compute branch_index (count of existing children of same parent)
    if parent_id:
        sibling_count = (await db.execute(
            select(func.count()).select_from(Message).where(Message.parent_id == parent_id)
        )).scalar() or 0
    else:
        sibling_count = 0

    # Build context references for persistence
    context_refs = None
    if body.context_conversation_ids:
        context_refs = []
        for ctx_id in body.context_conversation_ids[:3]:
            try:
                ctx_result = await db.execute(
                    select(Conversation).where(
                        Conversation.id == ctx_id,
                        Conversation.user_id == user_id,
                    )
                )
                ctx_conv = ctx_result.scalar_one_or_none()
                if ctx_conv:
                    context_refs.append({"id": str(ctx_id), "title": ctx_conv.title or "Untitled"})
            except Exception:
                continue

    # Save user message
    # Store context_refs alongside file attachments in the attachments JSON
    msg_attachments = body.attachments
    if context_refs:
        msg_attachments = (msg_attachments or []) + [{"type": "context", "contexts": context_refs}]

    user_msg = Message(
        conversation_id=conversation_id,
        role="user",
        content=body.content,
        attachments=msg_attachments,
        parent_id=parent_id,
        branch_index=sibling_count,
    )
    db.add(user_msg)
    await db.flush()
    await db.commit()

    # Use request overrides if provided, otherwise conversation defaults
    model = body.model or conv.model or "gpt-4.1-chn"
    mode = body.mode or conv.agent_mode or "code"
    # Update conversation if mode/model changed
    if model != conv.model or mode != conv.agent_mode:
        conv.model = model
        conv.agent_mode = mode
        await db.flush()
        await db.commit()

    # If a persona was specified in this request, attach it to the conversation
    if body.agent_persona_id and body.agent_persona_id != conv.agent_persona_id:
        conv.agent_persona_id = body.agent_persona_id
        await db.flush()
        await db.commit()

    # Update knowledge base IDs if provided
    if body.knowledge_base_ids is not None:
        conv.knowledge_base_ids = [str(kid) for kid in body.knowledge_base_ids]
        await db.flush()
        await db.commit()

    # Load persona if set
    persona = None
    if conv.agent_persona_id:
        p_result = await db.execute(
            select(AgentPersona).where(AgentPersona.id == conv.agent_persona_id)
        )
        persona = p_result.scalar_one_or_none()

    num_responses = max(1, min(5, body.num_responses or 1))

    # Build context from @mentioned conversations
    context_text = ""
    if body.context_conversation_ids:
        context_parts = []
        for ctx_id in body.context_conversation_ids[:3]:  # Max 3 contexts
            try:
                ctx_result = await db.execute(
                    select(Conversation).where(
                        Conversation.id == ctx_id, Conversation.user_id == user_id
                    )
                )
                ctx_conv = ctx_result.scalar_one_or_none()
                if not ctx_conv:
                    continue
                # Get last 10 messages from referenced conversation
                ctx_msgs = await db.execute(
                    select(Message)
                    .where(Message.conversation_id == ctx_id)
                    .order_by(Message.created_at.desc())
                    .limit(10)
                )
                msgs = list(reversed(list(ctx_msgs.scalars().all())))
                if msgs:
                    summary = "\n".join(
                        f"{'User' if m.role == 'user' else 'Assistant'}: {(m.content or '')[:300]}"
                        for m in msgs if m.role in ("user", "assistant")
                    )
                    context_parts.append(
                        f'[Context from conversation "{ctx_conv.title or "Untitled"}"]\n{summary}'
                    )
            except Exception:
                continue
        if context_parts:
            context_text = "\n\n".join(context_parts) + "\n\n---\n\n"

    # The user message content sent to the LLM includes context, but DB stores clean text
    llm_user_content = context_text + body.content if context_text else body.content

    async def event_generator():
        assistant_msg_id = None

        if num_responses > 1:
            # Multi-response: run N parallel agent loops
            async for event in run_multi_agent_loop(
                conversation_id=conversation_id,
                user_message=llm_user_content,
                model=model,
                mode=mode,
                persona=persona,
                sandbox_id=conv.sandbox_id,
                leaf_message_id=user_msg.id,
                num_responses=num_responses,
            ):
                # Capture active_leaf_id from all_done event
                if event.get("event") == "all_done":
                    try:
                        data = json.loads(event.get("data", "{}"))
                        assistant_msg_id = data.get("active_leaf_id")
                    except (json.JSONDecodeError, AttributeError):
                        pass
                yield event
        else:
            # Single response: existing path
            try:
                async for event in run_agent_loop(
                    conversation_id=conversation_id,
                    user_message=llm_user_content,
                    model=model,
                    mode=mode,
                    persona=persona,
                    sandbox_id=conv.sandbox_id,
                    db=db,
                    leaf_message_id=user_msg.id,
                ):
                    if event.get("event") == "done":
                        try:
                            data = json.loads(event.get("data", "{}"))
                            assistant_msg_id = data.get("message_id")
                        except (json.JSONDecodeError, AttributeError):
                            pass
                    yield event
            except Exception as e:
                yield {"event": "error", "data": json.dumps({"message": str(e)})}

        # Update active_leaf_id to point to the new assistant message
        if assistant_msg_id:
            try:
                await db.refresh(conv)
                conv.active_leaf_id = uuid.UUID(assistant_msg_id)
                await db.commit()
            except Exception:
                pass

        # Generate title after agent loop completes (for first message)
        try:
            await db.refresh(conv)
            msg_count = (await db.execute(
                select(func.count()).select_from(Message).where(Message.conversation_id == conversation_id)
            )).scalar() or 0
            if msg_count <= 2 and (not conv.title or conv.title == "New conversation"):
                try:
                    last_msg = (await db.execute(
                        select(Message).where(
                            Message.conversation_id == conversation_id,
                            Message.role == "assistant"
                        ).order_by(Message.created_at.desc()).limit(1)
                    )).scalar_one_or_none()
                    assistant_text = last_msg.content if last_msg else ""
                    title = await llm_service.generate_title(body.content, assistant_text)
                    conv.title = title
                    await db.commit()
                    yield {"event": "title", "data": json.dumps({"title": title})}
                except Exception as e:
                    conv.title = body.content[:50] + ("..." if len(body.content) > 50 else "")
                    await db.commit()
                    yield {"event": "title", "data": json.dumps({"title": conv.title})}
        except Exception:
            pass

    return EventSourceResponse(event_generator())


@router.post("/{conversation_id}/images")
async def generate_image(
    conversation_id: uuid.UUID,
    body: GenerateImageRequest,
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
    if not body.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")

    parent_id = conv.active_leaf_id
    if parent_id:
        sibling_count = (await db.execute(
            select(func.count()).select_from(Message).where(Message.parent_id == parent_id)
        )).scalar() or 0
    else:
        sibling_count = 0

    user_msg = Message(
        conversation_id=conversation_id,
        role="user",
        content=body.prompt.strip(),
        parent_id=parent_id,
        branch_index=sibling_count,
    )
    db.add(user_msg)
    await db.flush()

    payload = {
        "model": body.model,
        "prompt": body.prompt.strip(),
        "size": body.size,
    }
    headers = {
        "Authorization": f"Bearer {settings.LITE_LLM_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{settings.LITE_LLM_URL.rstrip('/')}/v1/images/generations",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
            image_data = response.json()
    except httpx.HTTPStatusError as e:
        detail = e.response.text or e.response.reason_phrase or "LiteLLM image request failed"
        raise HTTPException(status_code=e.response.status_code, detail=f"Image generation failed: {detail}") from e
    except httpx.TimeoutException as e:
        raise HTTPException(status_code=504, detail=f"Image generation timed out: {type(e).__name__}") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation error: {type(e).__name__}: {e!r}") from e

    try:
        first = image_data["data"][0]
        if "b64_json" in first:
            image_url = f"data:image/png;base64,{first['b64_json']}"
        else:
            image_url = first["url"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Invalid image response: {e}") from e

    assistant_msg = Message(
        conversation_id=conversation_id,
        role="assistant",
        content=f"Generated image for: {body.prompt.strip()}",
        images=[{"filename": "generated-image.png", "url": image_url}],
        parent_id=user_msg.id,
        branch_index=0,
    )
    db.add(assistant_msg)
    await db.flush()

    db.add(Artifact(
        conversation_id=conversation_id,
        message_id=assistant_msg.id,
        type="image",
        label="generated-image.png",
        content=image_url,
        metadata_={"model": body.model, "prompt": body.prompt.strip(), "size": body.size},
    ))

    conv.active_leaf_id = assistant_msg.id
    await db.commit()
    return {
        "user_message": _serialize_message(user_msg),
        "assistant_message": _serialize_message(assistant_msg),
        "active_leaf_id": str(assistant_msg.id),
    }


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


class RegenerateRequest(BaseModel):
    model: str | None = None

@router.post("/{conversation_id}/messages/{message_id}/regenerate")
async def regenerate_message(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    body: RegenerateRequest | None = None,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Regenerate creates a sibling branch — the old response is preserved."""
    # Verify ownership
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Get the assistant message to regenerate
    msg_result = await db.execute(
        select(Message).where(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
        )
    )
    target_msg = msg_result.scalar_one_or_none()
    if not target_msg or target_msg.role != "assistant":
        raise HTTPException(status_code=400, detail="Can only regenerate assistant messages")

    # The parent of the assistant message is the user message that prompted it
    parent_msg_id = target_msg.parent_id
    if not parent_msg_id:
        # Fallback: find the user message before this one by timestamp
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
        parent_msg_id = user_msg.id
        user_message_content = user_msg.content
    else:
        # Load the parent (user) message
        parent_result = await db.execute(
            select(Message).where(Message.id == parent_msg_id)
        )
        user_msg = parent_result.scalar_one_or_none()
        if not user_msg:
            raise HTTPException(status_code=400, detail="Parent user message not found")
        user_message_content = user_msg.content

    model = (body.model if body and body.model else None) or conv.model or "gpt-4.1-chn"
    mode = conv.agent_mode or "code"

    persona = None
    if conv.agent_persona_id:
        p_result = await db.execute(
            select(AgentPersona).where(AgentPersona.id == conv.agent_persona_id)
        )
        persona = p_result.scalar_one_or_none()

    async def event_generator():
        assistant_msg_id = None
        try:
            # Run agent loop with the user message as the leaf — the agent loop
            # will load path up to user_msg, then produce a new assistant response
            # as a sibling of the original
            async for event in run_agent_loop(
                conversation_id=conversation_id,
                user_message=user_message_content,
                model=model,
                mode=mode,
                persona=persona,
                sandbox_id=conv.sandbox_id,
                db=db,
                leaf_message_id=parent_msg_id,
            ):
                if event.get("event") == "done":
                    try:
                        data = json.loads(event.get("data", "{}"))
                        assistant_msg_id = data.get("message_id")
                    except (json.JSONDecodeError, AttributeError):
                        pass
                yield event
        except Exception as e:
            yield {"event": "error", "data": json.dumps({"message": str(e)})}

        # Update active_leaf_id to point to the new sibling
        if assistant_msg_id:
            try:
                await db.refresh(conv)
                conv.active_leaf_id = uuid.UUID(assistant_msg_id)
                await db.commit()
            except Exception:
                pass

    return EventSourceResponse(event_generator())


@router.get("/{conversation_id}/tree")
async def get_conversation_tree(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return lightweight tree structure for the minimap visualizer."""
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Get all messages with just the fields needed for the tree
    msg_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    all_messages = msg_result.scalars().all()

    # Count children per message
    child_counts: dict[str, int] = {}
    for m in all_messages:
        pid = str(m.parent_id) if m.parent_id else None
        if pid:
            child_counts[pid] = child_counts.get(pid, 0) + 1

    nodes = [
        {
            "id": str(m.id),
            "parentId": str(m.parent_id) if m.parent_id else None,
            "role": m.role,
            "branchIndex": m.branch_index,
            "preview": (m.content or "")[:50],
            "childCount": child_counts.get(str(m.id), 0),
            "createdAt": m.created_at.isoformat() if m.created_at else None,
        }
        for m in all_messages
        if m.role in ("user", "assistant")
    ]

    return {
        "nodes": nodes,
        "activeLeafId": str(conv.active_leaf_id) if conv.active_leaf_id else None,
    }


@router.post("/{conversation_id}/switch-branch")
async def switch_branch(
    conversation_id: uuid.UUID,
    body: SwitchBranchRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Switch active branch by updating active_leaf_id and returning the new path."""
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Verify the leaf message belongs to this conversation
    leaf_result = await db.execute(
        select(Message).where(
            Message.id == body.leaf_id,
            Message.conversation_id == conversation_id,
        )
    )
    if not leaf_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Message not found in conversation")

    conv.active_leaf_id = body.leaf_id
    await db.commit()

    # Return messages on the new active path
    path_messages = await get_active_path(db, body.leaf_id)
    return {
        "active_leaf_id": str(body.leaf_id),
        "messages": [_serialize_message(m) for m in path_messages],
    }


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
