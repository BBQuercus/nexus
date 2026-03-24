import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user
from backend.db import get_db
from backend.models import Artifact, Conversation, Message

router = APIRouter(prefix="/api/search", tags=["search"])


def _snippet(text: str, query: str, max_len: int = 200) -> str:
    """Extract a snippet around the first occurrence of the query term."""
    if not text:
        return ""
    lower = text.lower()
    q_lower = query.lower()
    idx = lower.find(q_lower)
    if idx == -1:
        return text[:max_len] + ("..." if len(text) > max_len else "")
    start = max(0, idx - 80)
    end = min(len(text), idx + len(query) + 120)
    snippet = text[start:end]
    if start > 0:
        snippet = "..." + snippet
    if end < len(text):
        snippet = snippet + "..."
    return snippet


@router.get("")
async def search(
    q: str = Query(..., min_length=1, max_length=500),
    scope: str = Query("all", pattern="^(all|conversations|messages|artifacts)$"),
    limit: int = Query(20, ge=1, le=100),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    results: dict = {
        "conversations": [],
        "messages": [],
        "artifacts": [],
        "total": 0,
    }

    search_term = q.strip()
    if not search_term:
        return results

    # Use PostgreSQL full-text search where possible, with ILIKE fallback
    ts_query = func.plainto_tsquery("english", search_term)
    like_pattern = f"%{search_term}%"

    # ── Search conversations by title ──
    if scope in ("all", "conversations"):
        conv_query = (
            select(Conversation)
            .where(
                Conversation.user_id == user_id,
                Conversation.title.ilike(like_pattern),
            )
            .order_by(Conversation.updated_at.desc())
            .limit(limit)
        )
        conv_result = await db.execute(conv_query)
        conversations = conv_result.scalars().all()
        for c in conversations:
            results["conversations"].append({
                "id": str(c.id),
                "type": "conversation",
                "title": c.title or "Untitled",
                "snippet": c.title or "",
                "conversation_id": str(c.id),
                "project_id": str(c.project_id) if c.project_id else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            })

    # ── Search messages by content ──
    if scope in ("all", "messages"):
        # Try full-text search first (uses tsv index on chunks, but messages
        # don't have tsv -- fall back to ILIKE on content)
        msg_query = (
            select(Message)
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(
                Conversation.user_id == user_id,
                Message.content.ilike(like_pattern),
            )
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        msg_result = await db.execute(msg_query)
        messages = msg_result.scalars().all()
        for m in messages:
            results["messages"].append({
                "id": str(m.id),
                "type": "message",
                "title": f"{m.role.capitalize()} message",
                "snippet": _snippet(m.content, search_term),
                "conversation_id": str(m.conversation_id),
                "created_at": m.created_at.isoformat() if m.created_at else None,
            })

    # ── Search artifacts by label and content ──
    if scope in ("all", "artifacts"):
        art_query = (
            select(Artifact)
            .join(Conversation, Artifact.conversation_id == Conversation.id)
            .where(
                Conversation.user_id == user_id,
                or_(
                    Artifact.label.ilike(like_pattern),
                    Artifact.content.ilike(like_pattern),
                ),
            )
            .order_by(Artifact.created_at.desc())
            .limit(limit)
        )
        art_result = await db.execute(art_query)
        artifacts = art_result.scalars().all()
        for a in artifacts:
            # Prefer matching in label, else snippet from content
            if search_term.lower() in (a.label or "").lower():
                snippet = a.label
            else:
                snippet = _snippet(a.content or "", search_term)
            results["artifacts"].append({
                "id": str(a.id),
                "type": "artifact",
                "title": a.label or a.type,
                "snippet": snippet,
                "conversation_id": str(a.conversation_id),
                "created_at": a.created_at.isoformat() if a.created_at else None,
            })

    results["total"] = (
        len(results["conversations"])
        + len(results["messages"])
        + len(results["artifacts"])
    )

    return results
