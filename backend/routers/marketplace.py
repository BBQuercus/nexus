import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_org, get_current_user, get_org_db
from backend.models import AgentPersona, AgentRating, KnowledgeBase, MarketplaceListing, User
from backend.services.audit import AuditAction, record_audit_event
from backend.vector_db import get_vector_db

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])


class PublishListingRequest(BaseModel):
    agent_persona_id: uuid.UUID | None = None
    knowledge_base_id: uuid.UUID | None = None
    access_mode: str | None = None  # extensible, fixed (required for KB)
    visibility: str = "public"
    category: str | None = None
    tags: list[str] | None = None


class UpdateListingRequest(BaseModel):
    category: str | None = None
    tags: list[str] | None = None
    visibility: str | None = None


class RateListingRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    review: str | None = None


def _serialize_listing(
    listing: MarketplaceListing | None,
    agent: AgentPersona | None = None,
    publisher: User | None = None,
    kb: KnowledgeBase | None = None,
) -> dict:
    publisher_name = publisher.name if publisher else None
    if listing is not None:
        result = {
            "id": str(listing.id),
            "listing_type": listing.listing_type or "agent",
            "org_id": str(listing.org_id),
            "agent_persona_id": str(listing.agent_persona_id) if listing.agent_persona_id else None,
            "knowledge_base_id": str(listing.knowledge_base_id) if listing.knowledge_base_id else None,
            "access_mode": listing.access_mode,
            "publisher_id": str(listing.publisher_id),
            "publisher_name": publisher_name,
            "visibility": listing.visibility,
            "status": listing.status,
            "category": listing.category,
            "tags": listing.tags,
            "version": listing.version,
            "install_count": listing.install_count,
            "avg_rating": float(listing.avg_rating) if listing.avg_rating is not None else None,
            "rating_count": listing.rating_count,
            "featured": listing.featured,
            "published_at": listing.published_at.isoformat() if listing.published_at else None,
            "created_at": listing.created_at.isoformat() if listing.created_at else None,
            "updated_at": listing.updated_at.isoformat() if listing.updated_at else None,
        }
    else:
        # Public agent without a formal marketplace listing
        result = {
            "id": str(agent.id) if agent else "",
            "listing_type": "agent",
            "org_id": "",
            "agent_persona_id": str(agent.id) if agent else "",
            "knowledge_base_id": None,
            "access_mode": None,
            "publisher_id": str(agent.user_id) if agent else "",
            "publisher_name": publisher_name,
            "visibility": "public",
            "status": "published",
            "category": agent.category if agent else None,
            "tags": None,
            "version": "1.0.0",
            "install_count": agent.usage_count if agent else 0,
            "avg_rating": None,
            "rating_count": 0,
            "featured": False,
            "published_at": agent.created_at.isoformat() if agent and agent.created_at else None,
            "created_at": agent.created_at.isoformat() if agent and agent.created_at else None,
            "updated_at": agent.updated_at.isoformat() if agent and agent.updated_at else None,
        }
    if agent:
        result["agent"] = {
            "id": str(agent.id),
            "name": agent.name,
            "description": agent.description,
            "icon": agent.icon,
            "default_model": agent.default_model,
            "default_mode": agent.default_mode,
            "system_prompt": agent.system_prompt,
        }
    if kb:
        result["knowledge_base"] = {
            "id": str(kb.id),
            "name": kb.name,
            "description": kb.description,
            "document_count": kb.document_count,
            "chunk_count": kb.chunk_count,
            "embedding_model": kb.embedding_model,
        }
    return result


def _serialize_rating(r: AgentRating) -> dict:
    return {
        "id": str(r.id),
        "marketplace_listing_id": str(r.marketplace_listing_id),
        "user_id": str(r.user_id),
        "rating": r.rating,
        "review": r.review,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


VALID_CATEGORIES = [
    "coding",
    "writing",
    "research",
    "data-analysis",
    "creative",
    "productivity",
    "education",
    "business",
    "other",
]


@router.get("/featured")
async def get_featured_listings(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    del user_id
    result = await db.execute(
        select(AgentPersona, MarketplaceListing, User)
        .outerjoin(MarketplaceListing, MarketplaceListing.agent_persona_id == AgentPersona.id)
        .outerjoin(User, User.id == AgentPersona.user_id)
        .where(
            AgentPersona.is_public == True,  # noqa: E712
            MarketplaceListing.featured == True,  # noqa: E712
        )
        .order_by(MarketplaceListing.install_count.desc().nullslast())
    )
    rows = result.all()
    return [_serialize_listing(listing, agent, publisher) for agent, listing, publisher in rows]


@router.get("/categories")
async def list_categories(
    user_id: uuid.UUID = Depends(get_current_user),
):
    del user_id
    return {"categories": VALID_CATEGORIES}


@router.get("")
async def browse_listings(
    category: str | None = Query(None),
    search: str | None = Query(None),
    listing_type: str | None = Query(None),  # agent, knowledge_base, or None for all
    sort_by: str = Query("popular", pattern="^(popular|recent|rating)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    del user_id
    results: list[dict] = []

    # ── Agent listings ──
    if listing_type in (None, "agent"):
        query = (
            select(AgentPersona, MarketplaceListing, User)
            .outerjoin(MarketplaceListing, MarketplaceListing.agent_persona_id == AgentPersona.id)
            .outerjoin(User, User.id == AgentPersona.user_id)
            .where(AgentPersona.is_public == True)  # noqa: E712
        )
        if category:
            query = query.where(or_(MarketplaceListing.category == category, AgentPersona.category == category))
        if search:
            pattern = f"%{search}%"
            query = query.where(AgentPersona.name.ilike(pattern) | AgentPersona.description.ilike(pattern))
        if sort_by == "popular":
            query = query.order_by(MarketplaceListing.install_count.desc().nullslast(), AgentPersona.usage_count.desc())
        elif sort_by == "recent":
            query = query.order_by(AgentPersona.created_at.desc())
        elif sort_by == "rating":
            query = query.order_by(MarketplaceListing.avg_rating.desc().nullslast())
        query = query.offset(offset).limit(limit)
        rows = (await db.execute(query)).all()
        results.extend(_serialize_listing(listing, agent, publisher) for agent, listing, publisher in rows)

    # ── Knowledge base listings ──
    if listing_type in (None, "knowledge_base"):
        kb_query = (
            select(MarketplaceListing, User)
            .outerjoin(User, User.id == MarketplaceListing.publisher_id)
            .where(MarketplaceListing.listing_type == "knowledge_base")
        )
        if category:
            kb_query = kb_query.where(MarketplaceListing.category == category)
        if search:
            pattern = f"%{search}%"
            kb_query = kb_query.where(MarketplaceListing.category.ilike(pattern))
        if sort_by == "popular":
            kb_query = kb_query.order_by(MarketplaceListing.install_count.desc().nullslast())
        elif sort_by == "recent":
            kb_query = kb_query.order_by(MarketplaceListing.created_at.desc())
        elif sort_by == "rating":
            kb_query = kb_query.order_by(MarketplaceListing.avg_rating.desc().nullslast())
        kb_query = kb_query.offset(offset).limit(limit)
        kb_rows = (await db.execute(kb_query)).all()

        # Batch-fetch KB metadata from vector DB
        kb_ids = [listing.knowledge_base_id for listing, _ in kb_rows if listing.knowledge_base_id]
        kb_map: dict[uuid.UUID, KnowledgeBase] = {}
        if kb_ids:
            try:
                from backend.vector_db import vector_async_session

                async with vector_async_session() as vdb:
                    kb_result = await vdb.execute(select(KnowledgeBase).where(KnowledgeBase.id.in_(kb_ids)))
                    for kb in kb_result.scalars().all():
                        kb_map[kb.id] = kb
            except Exception:
                pass  # vector DB unavailable — KB metadata will be missing

        for listing, publisher in kb_rows:
            kb = kb_map.get(listing.knowledge_base_id) if listing.knowledge_base_id else None
            if kb and search:
                pattern_lower = search.lower()
                if pattern_lower not in (kb.name or "").lower() and pattern_lower not in (kb.description or "").lower():
                    continue
            results.append(_serialize_listing(listing, publisher=publisher, kb=kb))

    return results


@router.get("/{listing_id}")
async def get_listing(
    listing_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    del user_id
    listing_result = await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == listing_id))
    listing = listing_result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    agent = None
    kb = None
    if listing.agent_persona_id:
        agent_result = await db.execute(select(AgentPersona).where(AgentPersona.id == listing.agent_persona_id))
        agent = agent_result.scalar_one_or_none()
    if listing.knowledge_base_id:
        try:
            from backend.vector_db import vector_async_session

            async with vector_async_session() as vdb:
                kb_result = await vdb.execute(
                    select(KnowledgeBase).where(KnowledgeBase.id == listing.knowledge_base_id)
                )
                kb = kb_result.scalar_one_or_none()
        except Exception:
            pass

    return _serialize_listing(listing, agent, kb=kb)


@router.post("")
async def publish_listing(
    body: PublishListingRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
    vector_db: AsyncSession = Depends(get_vector_db),
):
    if not body.agent_persona_id and not body.knowledge_base_id:
        raise HTTPException(400, "Either agent_persona_id or knowledge_base_id is required")
    if body.agent_persona_id and body.knowledge_base_id:
        raise HTTPException(400, "Provide only one of agent_persona_id or knowledge_base_id")

    agent = None
    kb = None
    lt = "agent"

    if body.agent_persona_id:
        result = await db.execute(
            select(AgentPersona).where(AgentPersona.id == body.agent_persona_id, AgentPersona.user_id == user_id)
        )
        agent = result.scalar_one_or_none()
        if not agent:
            raise HTTPException(404, "Agent not found or not owned by you")
        existing_result = await db.execute(
            select(MarketplaceListing).where(MarketplaceListing.agent_persona_id == body.agent_persona_id)
        )
    else:
        lt = "knowledge_base"
        if body.access_mode not in ("extensible", "fixed"):
            raise HTTPException(400, "access_mode must be 'extensible' or 'fixed' for knowledge bases")
        kb_result = await vector_db.execute(
            select(KnowledgeBase).where(KnowledgeBase.id == body.knowledge_base_id, KnowledgeBase.user_id == user_id)
        )
        kb = kb_result.scalar_one_or_none()
        if not kb:
            raise HTTPException(404, "Knowledge base not found or not owned by you")
        kb.is_public = True
        await vector_db.commit()
        existing_result = await db.execute(
            select(MarketplaceListing).where(MarketplaceListing.knowledge_base_id == body.knowledge_base_id)
        )

    existing = existing_result.scalar_one_or_none()

    if existing:
        current = existing.version or "1.0.0"
        parts = current.split(".")
        try:
            parts[-1] = str(int(parts[-1]) + 1)
        except (ValueError, IndexError):
            parts = ["1", "0", "1"]
        existing.version = ".".join(parts)
        existing.visibility = body.visibility
        if body.category is not None:
            existing.category = body.category
        if body.tags is not None:
            existing.tags = body.tags
        if body.access_mode:
            existing.access_mode = body.access_mode
        existing.published_at = datetime.now(UTC)
        existing.status = "published"
        await db.commit()
        await record_audit_event(
            AuditAction.MARKETPLACE_PUBLISHED,
            actor_id=str(user_id),
            resource_type="marketplace_listing",
            resource_id=str(existing.id),
        )
        return _serialize_listing(existing, agent, kb=kb)

    listing = MarketplaceListing(
        org_id=org_id,
        listing_type=lt,
        agent_persona_id=body.agent_persona_id,
        knowledge_base_id=body.knowledge_base_id,
        access_mode=body.access_mode,
        publisher_id=user_id,
        visibility=body.visibility,
        category=body.category,
        tags=body.tags,
        status="published",
        published_at=datetime.now(UTC),
    )
    db.add(listing)
    await db.flush()
    await db.commit()
    await record_audit_event(
        AuditAction.MARKETPLACE_PUBLISHED,
        actor_id=str(user_id),
        resource_type="marketplace_listing",
        resource_id=str(listing.id),
    )
    return _serialize_listing(listing, agent, kb=kb)


@router.patch("/{listing_id}")
async def update_listing(
    listing_id: uuid.UUID,
    body: UpdateListingRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(MarketplaceListing).where(
            MarketplaceListing.id == listing_id, MarketplaceListing.publisher_id == user_id
        )
    )
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found or not owned by you")

    if body.category is not None:
        listing.category = body.category
    if body.tags is not None:
        listing.tags = body.tags
    if body.visibility is not None:
        listing.visibility = body.visibility

    await db.commit()

    # Fetch agent for response
    agent_result = await db.execute(select(AgentPersona).where(AgentPersona.id == listing.agent_persona_id))
    agent = agent_result.scalar_one_or_none()
    return _serialize_listing(listing, agent)


@router.delete("/{listing_id}")
async def delete_listing(
    listing_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    result = await db.execute(
        select(MarketplaceListing).where(
            MarketplaceListing.id == listing_id, MarketplaceListing.publisher_id == user_id
        )
    )
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found or not owned by you")

    await db.delete(listing)
    await db.commit()
    return {"ok": True}


@router.post("/{listing_id}/install")
async def install_listing(
    listing_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    org_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_org_db),
    vector_db: AsyncSession = Depends(get_vector_db),
):
    listing_result = await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == listing_id))
    listing = listing_result.scalar_one_or_none()

    # ── Knowledge Base install ──
    if listing and listing.listing_type == "knowledge_base":
        if not listing.knowledge_base_id:
            raise HTTPException(400, "Listing has no knowledge base")
        kb_result = await vector_db.execute(select(KnowledgeBase).where(KnowledgeBase.id == listing.knowledge_base_id))
        original_kb = kb_result.scalar_one_or_none()
        if not original_kb:
            raise HTTPException(404, "Knowledge base not found")

        # Create a lightweight reference KB (no cloning of documents or chunks)
        ref_kb = KnowledgeBase(
            org_id=org_id,
            user_id=user_id,
            name=original_kb.name,
            description=original_kb.description,
            embedding_model=original_kb.embedding_model,
            chunk_strategy=original_kb.chunk_strategy,
            document_count=0,
            chunk_count=0,
            status="ready",
            is_public=False,
            installed_from_id=original_kb.id,
            access_mode=listing.access_mode or "fixed",
        )
        vector_db.add(ref_kb)
        await vector_db.flush()
        await vector_db.commit()

        listing.install_count = (listing.install_count or 0) + 1
        await db.commit()
        await record_audit_event(
            AuditAction.MARKETPLACE_INSTALLED,
            actor_id=str(user_id),
            resource_type="marketplace_listing",
            resource_id=str(listing.id),
        )
        return {
            "listing_id": str(listing.id),
            "installed_kb_id": str(ref_kb.id),
            "install_count": listing.install_count,
        }

    # ── Agent install ──
    original: AgentPersona | None = None
    if listing and listing.agent_persona_id:
        agent_result = await db.execute(select(AgentPersona).where(AgentPersona.id == listing.agent_persona_id))
        original = agent_result.scalar_one_or_none()
    elif not listing:
        # Unlisted public agent — listing_id is the agent's own ID
        agent_result = await db.execute(
            select(AgentPersona).where(AgentPersona.id == listing_id, AgentPersona.is_public == True)  # noqa: E712
        )
        original = agent_result.scalar_one_or_none()

    if not original:
        raise HTTPException(status_code=404, detail="Listing not found")

    clone = AgentPersona(
        user_id=user_id,
        org_id=org_id,
        name=original.name,
        description=original.description,
        system_prompt=original.system_prompt,
        default_model=original.default_model,
        default_mode=original.default_mode,
        icon=original.icon,
        category=original.category,
        tools_enabled=original.tools_enabled,
        is_public=False,
        installed_from_id=original.id,
    )
    db.add(clone)

    if listing:
        listing.install_count = (listing.install_count or 0) + 1
    else:
        original.usage_count = (original.usage_count or 0) + 1

    await db.flush()
    await db.commit()
    await record_audit_event(
        AuditAction.MARKETPLACE_INSTALLED,
        actor_id=str(user_id),
        resource_type="marketplace_listing",
        resource_id=str(listing.id) if listing else str(original.id),
    )
    return {
        "listing_id": str(listing.id) if listing else str(original.id),
        "installed_agent_id": str(clone.id),
        "install_count": listing.install_count if listing else original.usage_count,
    }


@router.post("/{listing_id}/rate")
async def rate_listing(
    listing_id: uuid.UUID,
    body: RateListingRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    # Verify listing exists
    listing_result = await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == listing_id))
    listing = listing_result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    # Upsert rating
    existing_result = await db.execute(
        select(AgentRating).where(
            AgentRating.marketplace_listing_id == listing_id,
            AgentRating.user_id == user_id,
        )
    )
    existing_rating = existing_result.scalar_one_or_none()

    if existing_rating:
        existing_rating.rating = body.rating
        existing_rating.review = body.review
    else:
        new_rating = AgentRating(
            marketplace_listing_id=listing_id,
            user_id=user_id,
            rating=body.rating,
            review=body.review,
        )
        db.add(new_rating)

    await db.flush()

    # Recalculate avg_rating
    avg_result = await db.execute(
        select(func.avg(AgentRating.rating), func.count(AgentRating.id)).where(
            AgentRating.marketplace_listing_id == listing_id
        )
    )
    avg_row = avg_result.one()
    listing.avg_rating = avg_row[0]
    listing.rating_count = avg_row[1]

    await db.commit()
    return {
        "listing_id": str(listing.id),
        "avg_rating": float(listing.avg_rating) if listing.avg_rating is not None else None,
        "rating_count": listing.rating_count,
    }


@router.get("/{listing_id}/ratings")
async def get_listing_ratings(
    listing_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_org_db),
):
    del user_id
    # Verify listing exists
    listing_result = await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == listing_id))
    if not listing_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Listing not found")

    result = await db.execute(
        select(AgentRating)
        .where(AgentRating.marketplace_listing_id == listing_id)
        .order_by(AgentRating.created_at.desc())
    )
    ratings = result.scalars().all()
    return [_serialize_rating(r) for r in ratings]
