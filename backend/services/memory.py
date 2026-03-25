"""AI Memory service — stores and retrieves user preferences, facts, and decisions."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from sqlalchemy import select, update

if TYPE_CHECKING:
    import uuid

    from sqlalchemy.ext.asyncio import AsyncSession

from backend.logging_config import get_logger
from backend.models import Memory

logger = get_logger("services.memory")

# Patterns that suggest the user is stating something memorable
_MEMORY_PATTERNS = [
    (r"\b(?:remember|don't forget)\b[:\s]+(.+)", "instruction"),
    (r"\b(?:always|never)\b\s+(.+)", "instruction"),
    (r"\b(?:i prefer|my preference is|i like to)\b\s+(.+)", "preference"),
    (r"\b(?:we decided|the decision is|decided to)\b\s+(.+)", "decision"),
    (r"\b(?:(?:important|key) fact|for reference|fyi|note that)\b[:\s]+(.+)", "fact"),
]


async def get_relevant_memories(
    db: AsyncSession,
    user_id: uuid.UUID,
    context: str,
    project_id: uuid.UUID | None = None,
    limit: int = 10,
) -> list[Memory]:
    """Find memories relevant to a conversation context using keyword matching.

    Searches active memories for the user, prioritising project-scoped ones
    when a project_id is provided.  Falls back to global memories.
    """
    # Tokenise the context into significant keywords (4+ chars)
    words = set(
        w.lower()
        for w in re.findall(r"[a-zA-Z0-9_]+", context)
        if len(w) >= 4
    )

    if not words:
        # If no meaningful keywords, return most recent active memories
        stmt = (
            select(Memory)
            .where(Memory.user_id == user_id, Memory.active.is_(True))
            .order_by(Memory.updated_at.desc())
            .limit(limit)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    # Fetch all active memories for the user (bounded — memories should be
    # a small set, typically < 200 per user).
    stmt = (
        select(Memory)
        .where(Memory.user_id == user_id, Memory.active.is_(True))
        .order_by(Memory.updated_at.desc())
        .limit(500)
    )
    result = await db.execute(stmt)
    all_memories = list(result.scalars().all())

    # Score each memory by keyword overlap
    scored: list[tuple[float, Memory]] = []
    for mem in all_memories:
        mem_words = set(
            w.lower()
            for w in re.findall(r"[a-zA-Z0-9_]+", mem.content)
            if len(w) >= 4
        )
        if not mem_words:
            continue
        overlap = len(words & mem_words)
        if overlap == 0:
            continue
        score = overlap / len(mem_words)
        # Boost project-scoped memories if they match the current project
        if project_id and mem.project_id == project_id:
            score += 0.5
        # Boost global scope slightly (always relevant)
        if mem.scope == "global":
            score += 0.1
        scored.append((score, mem))

    scored.sort(key=lambda x: x[0], reverse=True)
    top_memories = [mem for _, mem in scored[:limit]]

    # Bump relevance_count for returned memories
    if top_memories:
        mem_ids = [m.id for m in top_memories]
        await db.execute(
            update(Memory)
            .where(Memory.id.in_(mem_ids))
            .values(relevance_count=Memory.relevance_count + 1)
        )
        await db.flush()

    return top_memories


def extract_memories_from_message(
    user_id: uuid.UUID,
    message_content: str,
    conversation_id: uuid.UUID | None = None,
    message_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
) -> list[Memory]:
    """Extract memorable facts from a user message using pattern matching.

    Returns unsaved Memory objects — the caller should add them to the session.
    """
    extracted: list[Memory] = []
    content_lower = message_content.lower()

    for pattern, category in _MEMORY_PATTERNS:
        for match in re.finditer(pattern, content_lower, re.IGNORECASE):
            captured = match.group(1).strip()
            # Skip very short or very long captures
            if len(captured) < 5 or len(captured) > 500:
                continue

            mem = Memory(
                user_id=user_id,
                project_id=project_id,
                scope="project" if project_id else "global",
                category=category,
                content=captured,
                source_conversation_id=conversation_id,
                source_message_id=message_id,
            )
            extracted.append(mem)

    return extracted


def format_memories_for_prompt(memories: list[Memory]) -> str:
    """Format memories as a system prompt section."""
    if not memories:
        return ""

    lines = ["<user_memory>", "The following are things you should remember about this user:"]
    for mem in memories:
        prefix = f"[{mem.category}]"
        scope_note = f" ({mem.scope})" if mem.scope != "global" else ""
        lines.append(f"- {prefix}{scope_note} {mem.content}")
    lines.append("</user_memory>")

    return "\n".join(lines)
