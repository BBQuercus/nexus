import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user
from backend.db import get_db
from backend.logging_config import get_logger
from backend.models import Conversation, Feedback, Message

logger = get_logger("feedback")

router = APIRouter(prefix="/api/conversations", tags=["feedback"])


# ----- Schemas -----


class CreateFeedbackRequest(BaseModel):
    rating: str  # "up" or "down"
    tags: Optional[list[str]] = None
    comment: Optional[str] = None


class FeedbackResponse(BaseModel):
    id: str
    message_id: str
    rating: str
    tags: Optional[list[str]] = None
    comment: Optional[str] = None
    created_at: str


# ----- Routes -----


@router.post("/{conv_id}/messages/{msg_id}/feedback")
async def create_feedback(
    conv_id: uuid.UUID,
    msg_id: uuid.UUID,
    body: CreateFeedbackRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit feedback for a message."""
    if body.rating not in ("up", "down"):
        raise HTTPException(status_code=400, detail="Rating must be 'up' or 'down'")

    # Verify conversation belongs to user
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conv_id, Conversation.user_id == user_id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Verify message belongs to conversation
    result = await db.execute(
        select(Message).where(
            Message.id == msg_id, Message.conversation_id == conv_id
        )
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    # Check for existing feedback on this message by this user
    result = await db.execute(
        select(Feedback).where(
            Feedback.message_id == msg_id, Feedback.user_id == user_id
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Update existing feedback
        existing.rating = body.rating
        existing.tags = body.tags
        existing.comment = body.comment
        feedback = existing
        logger.info(
            "feedback_updated",
            feedback_id=str(feedback.id),
            message_id=str(msg_id),
            rating=body.rating,
        )
    else:
        # Create new feedback record
        feedback = Feedback(
            user_id=user_id,
            message_id=msg_id,
            conversation_id=conv_id,
            rating=body.rating,
            tags=body.tags,
            comment=body.comment,
            model=conv.model,
        )
        db.add(feedback)
        logger.info(
            "feedback_created",
            message_id=str(msg_id),
            rating=body.rating,
        )

    # Update message.feedback for backwards compatibility
    await db.execute(
        update(Message).where(Message.id == msg_id).values(feedback=body.rating)
    )

    await db.flush()

    return {
        "id": str(feedback.id),
        "message_id": str(msg_id),
        "rating": feedback.rating,
        "tags": feedback.tags,
        "comment": feedback.comment,
        "created_at": feedback.created_at.isoformat() if feedback.created_at else None,
    }


@router.get("/{conv_id}/feedback")
async def list_conversation_feedback(
    conv_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all feedback for a conversation."""
    # Verify conversation belongs to user
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conv_id, Conversation.user_id == user_id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    result = await db.execute(
        select(Feedback)
        .where(Feedback.conversation_id == conv_id)
        .order_by(Feedback.created_at.desc())
    )
    feedbacks = result.scalars().all()

    return [
        {
            "id": str(f.id),
            "message_id": str(f.message_id),
            "rating": f.rating,
            "tags": f.tags,
            "comment": f.comment,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        }
        for f in feedbacks
    ]
