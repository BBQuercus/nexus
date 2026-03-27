import json
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import delete, func, select, update
from sqlalchemy import text as sa_text
from sqlalchemy.exc import DBAPIError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sse_starlette.sse import EventSourceResponse

from backend.auth import get_current_org, get_current_user, get_org_db, validate_csrf
from backend.config import settings
from backend.logging_config import get_logger
from backend.models import AgentPersona, Artifact, Conversation, Message, UsageLog
from backend.rate_limit import check_rate_limit
from backend.services import llm as llm_service
from backend.services import sandbox as sandbox_service
from backend.services.agent import run_agent_loop, run_multi_agent_loop
from backend.services.audit import AuditAction, record_audit_event
from backend.services.memory import save_memories_from_message
from backend.services.messages import extract_message_files
from backend.services.rbac import require_permission

router = APIRouter(prefix="/api/conversations", tags=["conversations"])
logger = get_logger("routers.chat")


# ----- Schemas -----


class BulkDeleteRequest(BaseModel):
    ids: list[uuid.UUID]


class CreateConversationRequest(BaseModel):
    title: str | None = None
    model: str | None = "azure_ai/claude-sonnet-4-5-swc"
    agent_mode: str = "code"
    agent_persona_id: uuid.UUID | None = None
    sandbox_template: str | None = None
    knowledge_base_ids: list[uuid.UUID] | None = None


class UpdateConversationRequest(BaseModel):
    title: str | None = None
    model: str | None = None
    agent_mode: str | None = None
    agent_persona_id: uuid.UUID | None = None


class ImageAttachment(BaseModel):
    filename: str
    data_url: str  # base64 data URL (e.g. data:image/png;base64,...)


class SendMessageRequest(BaseModel):
    content: str
    attachments: list | None = None
    model: str | None = None
    mode: str | None = None
    parent_id: uuid.UUID | None = None
    num_responses: int | None = 1  # 1-5 parallel responses
    compare_models: list[str] | None = None  # Run same prompt against multiple models
    context_conversation_ids: list[uuid.UUID] | None = None  # @mentioned conversations
    agent_persona_id: uuid.UUID | None = None  # Override persona for this message
    knowledge_base_ids: list[uuid.UUID] | None = None  # Attach KBs for RAG
    temperature: float | None = None  # 0.0-1.0 creativity control
    verbosity: str | None = None  # concise | detailed (omit for balanced)
    tone: str | None = None  # casual | technical (omit for professional)
    images: list[ImageAttachment] | None = None  # Inline image attachments for vision


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
    msg_result = await db.execute(select(Message).where(Message.id.in_(path_ids)).order_by(Message.created_at))
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
        "charts": m.charts,
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


def _is_missing_schema_error(exc: Exception, *, table: str | None = None, column: str | None = None) -> bool:
    message = str(getattr(exc, "orig", exc)).lower()
    if "undefinedtable" in message or "does not exist" in message:
        return table is None or table.lower() in message
    if "undefinedcolumn" in message or "column" in message:
        return column is not None and column.lower() in message
    return False


async def _list_conversations_legacy(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    search: str | None,
    page: int,
    limit: int,
) -> dict:
    filters = ["user_id = :user_id"]
    params: dict[str, object] = {
        "user_id": str(user_id),
        "limit": limit,
        "offset": (page - 1) * limit,
    }
    if search:
        filters.append("title ILIKE :search")
        params["search"] = f"%{search}%"

    where_clause = " AND ".join(filters)
    total = (
        await db.execute(
            sa_text(f"SELECT COUNT(*) FROM conversations WHERE {where_clause}"),
            params,
        )
    ).scalar() or 0

    conversations_result = await db.execute(
        sa_text(
            f"""
            SELECT id, title, model, agent_mode, sandbox_id, created_at, updated_at
            FROM conversations
            WHERE {where_clause}
            ORDER BY updated_at DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        params,
    )
    conversations = conversations_result.mappings().all()
    conversation_ids = [row["id"] for row in conversations]

    message_counts: dict[uuid.UUID, int] = {}
    if conversation_ids:
        count_result = await db.execute(
            select(Message.conversation_id, func.count(Message.id))
            .where(Message.conversation_id.in_(conversation_ids))
            .group_by(Message.conversation_id)
        )
        message_counts = {conversation_id: int(message_count) for conversation_id, message_count in count_result.all()}

    return {
        "conversations": [
            {
                "id": str(row["id"]),
                "title": row["title"],
                "model": row["model"],
                "agent_mode": row["agent_mode"],
                "sandbox_id": row["sandbox_id"],
                "project_id": None,
                "message_count": message_counts.get(row["id"], 0),
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            }
            for row in conversations
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }


# ----- Endpoints -----


@router.post("")
async def create_conversation(
    body: CreateConversationRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
):
    conv = Conversation(
        user_id=user_id,
        org_id=org_id,
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
    await record_audit_event(
        AuditAction.CONVERSATION_CREATED, actor_id=str(user_id), resource_type="conversation", resource_id=str(conv.id)
    )
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
    search: str | None = Query(None),
    project_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    try:
        query = select(Conversation).where(Conversation.user_id == user_id)
        if search:
            query = query.where(Conversation.title.ilike(f"%{search}%"))
        if project_id:
            query = query.where(Conversation.project_id == project_id)
        query = query.order_by(Conversation.updated_at.desc())

        count_query = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_query)).scalar() or 0

        query = query.offset((page - 1) * limit).limit(limit)
        result = await db.execute(query)
        conversations = result.scalars().all()
        conversation_ids = [c.id for c in conversations]

        message_counts: dict[uuid.UUID, int] = {}
        if conversation_ids:
            count_result = await db.execute(
                select(Message.conversation_id, func.count(Message.id))
                .where(Message.conversation_id.in_(conversation_ids))
                .group_by(Message.conversation_id)
            )
            message_counts = {
                conversation_id: int(message_count) for conversation_id, message_count in count_result.all()
            }

        return {
            "conversations": [
                {
                    "id": str(c.id),
                    "title": c.title,
                    "model": c.model,
                    "agent_mode": c.agent_mode,
                    "sandbox_id": c.sandbox_id,
                    "project_id": str(c.project_id) if c.project_id else None,
                    "message_count": message_counts.get(c.id, 0),
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                    "updated_at": c.updated_at.isoformat() if c.updated_at else None,
                }
                for c in conversations
            ],
            "total": total,
            "page": page,
            "limit": limit,
        }
    except (ProgrammingError, DBAPIError) as exc:
        if not _is_missing_schema_error(exc, table="conversations", column="project_id"):
            raise
        logger.warning(
            "legacy_conversations_schema_detected",
            error=str(getattr(exc, "orig", exc)),
            user_id=str(user_id),
        )
        return await _list_conversations_legacy(db=db, user_id=user_id, search=search, page=page, limit=limit)


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Return only active path messages (or all if no active_leaf_id set yet)
    if conv.active_leaf_id:
        path_messages = await get_active_path(db, conv.active_leaf_id)
    else:
        msg_result = await db.execute(
            select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at)
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
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
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
    user_id: uuid.UUID = Depends(require_permission("conversation.delete")),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
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

    message_ids = (
        (await db.execute(select(Message.id).where(Message.conversation_id == conversation_id))).scalars().all()
    )

    # Break any conversation/message references before deleting child rows.
    conv.active_leaf_id = None
    conv.forked_from_message_id = None
    await db.flush()

    if message_ids:
        await db.execute(
            update(Conversation)
            .where(Conversation.forked_from_message_id.in_(message_ids))
            .values(forked_from_message_id=None)
        )
        await db.execute(
            update(Message)
            .where(Message.conversation_id == conversation_id, Message.parent_id.in_(message_ids))
            .values(parent_id=None)
        )
        await db.execute(delete(Artifact).where(Artifact.message_id.in_(message_ids)))

    await db.execute(delete(Artifact).where(Artifact.conversation_id == conversation_id))
    await db.execute(delete(UsageLog).where(UsageLog.conversation_id == conversation_id))
    await db.execute(delete(Message).where(Message.conversation_id == conversation_id))
    await db.execute(delete(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id))
    await db.commit()
    await record_audit_event(
        AuditAction.CONVERSATION_DELETED,
        actor_id=str(user_id),
        resource_type="conversation",
        resource_id=str(conversation_id),
    )
    return {"ok": True}


@router.post("/bulk-delete", dependencies=[Depends(validate_csrf)])
async def bulk_delete_conversations(
    body: BulkDeleteRequest,
    user_id: uuid.UUID = Depends(require_permission("conversation.delete")),
    db: AsyncSession = Depends(get_org_db),
):
    if not body.ids:
        return {"deleted": 0, "failed": []}

    deleted_ids: list[str] = []
    failed_ids: list[str] = []

    for conv_id in body.ids:
        try:
            result = await db.execute(
                select(Conversation).where(Conversation.id == conv_id, Conversation.user_id == user_id)
            )
            conv = result.scalar_one_or_none()
            if not conv:
                failed_ids.append(str(conv_id))
                continue

            if conv.sandbox_id:
                try:
                    sb = await sandbox_service.get_sandbox(conv.sandbox_id)
                    await sandbox_service.delete_sandbox(sb)
                except Exception:
                    pass

            message_ids = (
                (await db.execute(select(Message.id).where(Message.conversation_id == conv_id))).scalars().all()
            )
            conv.active_leaf_id = None
            conv.forked_from_message_id = None
            await db.flush()

            if message_ids:
                await db.execute(
                    update(Conversation)
                    .where(Conversation.forked_from_message_id.in_(message_ids))
                    .values(forked_from_message_id=None)
                )
                await db.execute(
                    update(Message)
                    .where(Message.conversation_id == conv_id, Message.parent_id.in_(message_ids))
                    .values(parent_id=None)
                )
                await db.execute(delete(Artifact).where(Artifact.message_id.in_(message_ids)))

            await db.execute(delete(Artifact).where(Artifact.conversation_id == conv_id))
            await db.execute(delete(UsageLog).where(UsageLog.conversation_id == conv_id))
            await db.execute(delete(Message).where(Message.conversation_id == conv_id))
            await db.execute(delete(Conversation).where(Conversation.id == conv_id, Conversation.user_id == user_id))
            deleted_ids.append(str(conv_id))
        except Exception:
            failed_ids.append(str(conv_id))
            await db.rollback()

    await db.commit()
    return {"deleted": len(deleted_ids), "failed": failed_ids}


@router.delete("/{conversation_id}/messages/{message_id}", dependencies=[Depends(validate_csrf)])
async def delete_message(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    # Verify conversation ownership
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
    )
    if not conv_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg_result = await db.execute(
        select(Message).where(Message.id == message_id, Message.conversation_id == conversation_id)
    )
    msg = msg_result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    # Detach children so they become root-level messages in the conversation
    await db.execute(
        update(Message)
        .where(Message.parent_id == message_id)
        .values(parent_id=msg.parent_id)
    )

    # If this message is the active leaf, clear it
    await db.execute(
        update(Conversation)
        .where(Conversation.active_leaf_id == message_id)
        .values(active_leaf_id=None)
    )

    # Delete artifacts and message
    await db.execute(delete(Artifact).where(Artifact.message_id == message_id))
    await db.execute(delete(Message).where(Message.id == message_id))
    await db.commit()
    return {"ok": True}


@router.post("/{conversation_id}/messages")
async def send_message(
    conversation_id: uuid.UUID,
    body: SendMessageRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    # Rate limit: 60 requests per minute per user
    await check_rate_limit(str(user_id), limit=60, window_seconds=60, category="chat")

    # Verify conversation belongs to user
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
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
        sibling_count = (
            await db.execute(select(func.count()).select_from(Message).where(Message.parent_id == parent_id))
        ).scalar() or 0
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

    # Store image metadata (without data URLs to keep DB lean)
    user_images = None
    if body.images:
        user_images = [{"filename": img.filename, "url": img.data_url} for img in body.images]

    user_msg = Message(
        org_id=conv.org_id,
        conversation_id=conversation_id,
        role="user",
        content=body.content,
        attachments=msg_attachments,
        images=user_images,
        parent_id=parent_id,
        branch_index=sibling_count,
    )
    db.add(user_msg)
    await db.flush()
    await db.commit()

    try:
        saved_memories = await save_memories_from_message(
            db,
            org_id=conv.org_id,
            user_id=user_id,
            message_content=body.content,
            conversation_id=conversation_id,
            message_id=user_msg.id,
            project_id=getattr(conv, "project_id", None),
        )
        if saved_memories:
            await db.commit()
    except Exception as e:
        await db.rollback()
        logger.warning(
            "memory_persistence_failed",
            error=str(e),
            conversation_id=str(conversation_id),
            message_id=str(user_msg.id),
        )

    # Use request overrides if provided, otherwise conversation defaults
    model = body.model or conv.model or "azure_ai/claude-sonnet-4-5-swc"
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
        p_result = await db.execute(select(AgentPersona).where(AgentPersona.id == conv.agent_persona_id))
        persona = p_result.scalar_one_or_none()

    compare_models = body.compare_models[:5] if body.compare_models else None
    num_responses = len(compare_models) if compare_models else max(1, min(5, body.num_responses or 1))

    # Build context from @mentioned conversations
    context_text = ""
    if body.context_conversation_ids:
        context_parts = []
        for ctx_id in body.context_conversation_ids[:3]:  # Max 3 contexts
            try:
                ctx_result = await db.execute(
                    select(Conversation).where(Conversation.id == ctx_id, Conversation.user_id == user_id)
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
                        for m in msgs
                        if m.role in ("user", "assistant")
                    )
                    context_parts.append(f'[Context from conversation "{ctx_conv.title or "Untitled"}"]\n{summary}')
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
                compare_models=compare_models,
                temperature=body.temperature,
                verbosity=body.verbosity,
                tone=body.tone,
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
                    temperature=body.temperature,
                    verbosity=body.verbosity,
                    tone=body.tone,
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
            msg_count = (
                await db.execute(
                    select(func.count()).select_from(Message).where(Message.conversation_id == conversation_id)
                )
            ).scalar() or 0
            if msg_count <= 2 and (not conv.title or conv.title == "New conversation"):
                try:
                    last_msg = (
                        await db.execute(
                            select(Message)
                            .where(Message.conversation_id == conversation_id, Message.role == "assistant")
                            .order_by(Message.created_at.desc())
                            .limit(1)
                        )
                    ).scalar_one_or_none()
                    assistant_text = last_msg.content if last_msg else ""
                    title = await llm_service.generate_title(body.content, assistant_text)
                    conv.title = title
                    await db.commit()
                    yield {"event": "title", "data": json.dumps({"title": title})}
                except Exception:
                    conv.title = body.content[:50] + ("..." if len(body.content) > 50 else "")
                    await db.commit()
                    yield {"event": "title", "data": json.dumps({"title": conv.title})}
        except Exception:
            pass

    return EventSourceResponse(event_generator(), ping=15)


@router.post("/{conversation_id}/images")
async def generate_image(
    conversation_id: uuid.UUID,
    body: GenerateImageRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not body.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")

    parent_id = conv.active_leaf_id
    if parent_id:
        sibling_count = (
            await db.execute(select(func.count()).select_from(Message).where(Message.parent_id == parent_id))
        ).scalar() or 0
    else:
        sibling_count = 0

    user_msg = Message(
        org_id=conv.org_id,
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
        logger.error("image_generation_http_error", status=e.response.status_code, body=e.response.text[:200])
        raise HTTPException(status_code=502, detail="Image generation failed. Please try again.") from e
    except httpx.TimeoutException as e:
        raise HTTPException(status_code=504, detail="Image generation is taking too long. Try a simpler prompt or try again.") from e
    except Exception as e:
        logger.error("image_generation_error", error=str(e), error_type=type(e).__name__)
        raise HTTPException(status_code=500, detail="Image generation is temporarily unavailable. Please try again.") from e

    try:
        first = image_data["data"][0]
        image_url = f"data:image/png;base64,{first['b64_json']}" if "b64_json" in first else first["url"]
    except Exception as e:
        logger.error("image_response_parse_error", error=str(e))
        raise HTTPException(status_code=500, detail="Received an unexpected response from the image service. Please try again.") from e

    assistant_msg = Message(
        org_id=conv.org_id,
        conversation_id=conversation_id,
        role="assistant",
        content=f"Generated image for: {body.prompt.strip()}",
        images=[{"filename": "generated-image.png", "url": image_url}],
        parent_id=user_msg.id,
        branch_index=0,
    )
    db.add(assistant_msg)
    await db.flush()

    db.add(
        Artifact(
            org_id=conv.org_id,
            conversation_id=conversation_id,
            message_id=assistant_msg.id,
            type="image",
            label="generated-image.png",
            content=image_url,
            metadata_={"model": body.model, "prompt": body.prompt.strip(), "size": body.size},
        )
    )

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
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
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
        org_id=org_id,
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
            org_id=new_conv.org_id,
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
    db: AsyncSession = Depends(get_org_db),
):
    """Regenerate creates a sibling branch — the old response is preserved."""
    # Verify ownership
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
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
        parent_result = await db.execute(select(Message).where(Message.id == parent_msg_id))
        user_msg = parent_result.scalar_one_or_none()
        if not user_msg:
            raise HTTPException(status_code=400, detail="Parent user message not found")
        user_message_content = user_msg.content

    model = (body.model if body and body.model else None) or conv.model or "azure_ai/claude-sonnet-4-5-swc"
    mode = conv.agent_mode or "code"

    persona = None
    if conv.agent_persona_id:
        p_result = await db.execute(select(AgentPersona).where(AgentPersona.id == conv.agent_persona_id))
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

    return EventSourceResponse(event_generator(), ping=15)


@router.get("/{conversation_id}/tree")
async def get_conversation_tree(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    """Return lightweight tree structure for the minimap visualizer."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Get all messages with just the fields needed for the tree
    msg_result = await db.execute(
        select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at)
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


@router.get("/{conversation_id}/messages/{message_id}/siblings")
async def get_message_siblings(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    """Get all sibling messages (messages sharing the same parent)."""
    conv = (
        await db.execute(
            select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
        )
    ).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Find the target message to get its parent_id
    target = (await db.execute(select(Message).where(Message.id == message_id))).scalar_one_or_none()
    if not target or not target.parent_id:
        raise HTTPException(status_code=404, detail="Message not found or has no parent")

    # Fetch all siblings (same parent)
    siblings = (
        (
            await db.execute(
                select(Message)
                .where(Message.parent_id == target.parent_id, Message.conversation_id == conversation_id)
                .order_by(Message.branch_index, Message.created_at)
            )
        )
        .scalars()
        .all()
    )

    return [_serialize_message(m) for m in siblings]


@router.post("/{conversation_id}/switch-branch")
async def switch_branch(
    conversation_id: uuid.UUID,
    body: SwitchBranchRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    """Switch active branch by updating active_leaf_id and returning the new path."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
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
    db: AsyncSession = Depends(get_org_db),
):
    # Verify ownership
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    artifacts_result = await db.execute(
        select(Artifact).where(Artifact.conversation_id == conversation_id).order_by(Artifact.created_at)
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
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(Artifact).join(Conversation).where(Artifact.id == artifact_id, Conversation.user_id == user_id)
    )
    artifact = result.scalar_one_or_none()
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    await db.delete(artifact)
    await db.commit()
    return {"ok": True}


class UpdateArtifactRequest(BaseModel):
    pinned: bool | None = None
    label: str | None = None


@artifact_router.patch("/{artifact_id}")
async def update_artifact(
    artifact_id: uuid.UUID,
    body: UpdateArtifactRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(Artifact).join(Conversation).where(Artifact.id == artifact_id, Conversation.user_id == user_id)
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
