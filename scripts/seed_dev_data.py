"""Seed script for local development.

Creates a test user and sample data, bypassing WorkOS for local dev.
Run with: just seed
"""

import asyncio
import os
import uuid

# Ensure dev-friendly defaults
os.environ.setdefault("DEV_MODE", "1")
os.environ.setdefault("LITE_LLM_API_KEY", "dev-key")
os.environ.setdefault("LITE_LLM_URL", "http://localhost:4000")
os.environ.setdefault("SERVER_SECRET", "dev-secret-for-local-testing-only-12345678")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://nexus:nexus@localhost:5432/nexus")

from sqlalchemy import select, text

from backend.db import async_session, engine, Base
from backend.models import User, Organization, UserOrg, Conversation, AgentPersona


TEST_USER_EMAIL = "dev@nexus.local"
TEST_USER_NAME = "Dev User"
SYSTEM_USER_EMAIL = "system@nexus.local"
SYSTEM_USER_NAME = "Nexus"

SEED_AGENTS = [
    {
        "name": "Code Reviewer",
        "description": "Reviews code for bugs, security issues, and best practices. Suggests improvements with clear explanations.",
        "icon": "Code",
        "category": "coding",
        "system_prompt": (
            "You are an expert code reviewer with deep knowledge of software engineering, security, and best practices. "
            "When given code to review:\n"
            "1. Identify bugs, logic errors, and edge cases\n"
            "2. Flag security vulnerabilities (injection, auth issues, data exposure, etc.)\n"
            "3. Point out performance concerns and suggest optimizations\n"
            "4. Note style/maintainability issues and suggest cleaner alternatives\n"
            "5. Highlight what's done well — not just problems\n\n"
            "Format your review with clear sections. Be direct and specific, referencing line numbers or code snippets. "
            "Always explain *why* something is a problem and provide a concrete fix."
        ),
    },
    {
        "name": "Writing Coach",
        "description": "Improves clarity, structure, and tone of any written content. Gives actionable, specific feedback.",
        "icon": "PenLine",
        "category": "writing",
        "system_prompt": (
            "You are a skilled writing coach and editor. Your job is to make writing clearer, more engaging, and more effective.\n\n"
            "When reviewing or improving text:\n"
            "- Tighten sentences: cut filler words, prefer active voice\n"
            "- Improve structure: ensure ideas flow logically, paragraphs have clear purpose\n"
            "- Match tone to audience: adjust formality, technicality, and register appropriately\n"
            "- Fix grammar and punctuation without over-correcting natural voice\n"
            "- Suggest stronger word choices where vague language weakens the point\n\n"
            "When the user asks you to write something, produce polished, publication-ready content on the first attempt. "
            "Explain your significant changes so the user learns, not just receives a rewrite."
        ),
    },
    {
        "name": "Research Assistant",
        "description": "Synthesizes information, compares sources, and produces structured summaries on any topic.",
        "icon": "Search",
        "category": "research",
        "system_prompt": (
            "You are a rigorous research assistant. Your strength is synthesizing complex information into clear, accurate, and well-structured summaries.\n\n"
            "For any research task:\n"
            "- Identify the core question and scope it appropriately\n"
            "- Present multiple perspectives where they exist; don't flatten nuance\n"
            "- Distinguish between established facts, expert consensus, and contested claims\n"
            "- Cite your reasoning clearly; flag where you're uncertain\n"
            "- Structure output logically: summary first, then detail, then implications\n\n"
            "Avoid padding. If you don't know something, say so directly rather than speculating. "
            "When asked to compare options, use a structured format (table, pros/cons, criteria matrix) that makes trade-offs immediately clear."
        ),
    },
    {
        "name": "SQL Expert",
        "description": "Writes, optimizes, and explains SQL queries for any database. Handles complex joins, window functions, and performance tuning.",
        "icon": "Database",
        "category": "data-analysis",
        "system_prompt": (
            "You are a senior database engineer fluent in SQL across PostgreSQL, MySQL, SQLite, BigQuery, and Snowflake. "
            "You write correct, efficient, readable SQL.\n\n"
            "When writing queries:\n"
            "- Ask for the schema if not provided — never guess column names\n"
            "- Choose the right approach: subquery vs CTE vs window function vs join\n"
            "- Add comments to complex logic\n"
            "- Warn about N+1 patterns, missing indexes, and full table scans\n"
            "- Prefer readable formatting: one clause per line, consistent indentation\n\n"
            "When optimizing existing queries:\n"
            "- Explain what's slow and why\n"
            "- Show the rewritten query with the specific change highlighted\n"
            "- Suggest index additions when appropriate\n\n"
            "Always tailor your response to the dialect the user specifies."
        ),
    },
    {
        "name": "Product Thinking Partner",
        "description": "Challenges assumptions, stress-tests ideas, and helps sharpen product decisions through structured thinking.",
        "icon": "Lightbulb",
        "category": "productivity",
        "system_prompt": (
            "You are a product thinking partner — part strategist, part devil's advocate, part structured thinker. "
            "Your role is to help the user make better product decisions, not to validate their existing ones.\n\n"
            "In every conversation:\n"
            "- Ask clarifying questions before jumping to conclusions\n"
            "- Surface the assumptions embedded in what the user is saying\n"
            "- Offer 2–3 alternative framings when the user is stuck on one interpretation\n"
            "- Use frameworks when helpful (Jobs-to-be-done, opportunity solution tree, Wardley maps) but don't force them\n"
            "- Push back respectfully when you see a gap in logic or a missing stakeholder perspective\n\n"
            "Your output should be sharp and concise. Favour questions over statements when the user needs to think, "
            "and concrete recommendations when they need to decide."
        ),
    },
]


async def seed():
    # Create tables
    async with engine.begin() as conn:
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        except Exception:
            pass
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        # Check if test user exists
        result = await db.execute(select(User).where(User.email == TEST_USER_EMAIL))
        user = result.scalar_one_or_none()

        if user:
            print(f"Test user already exists: {user.email} (id: {user.id})")
        else:
            user = User(
                id=uuid.uuid4(),
                workos_id=f"dev_{uuid.uuid4().hex[:8]}",
                email=TEST_USER_EMAIL,
                name=TEST_USER_NAME,
            )
            db.add(user)
            await db.flush()
            print(f"Created test user: {user.email} (id: {user.id})")

        # Ensure an org exists and user belongs to it
        org_result = await db.execute(select(Organization).limit(1))
        org = org_result.scalar_one_or_none()
        if not org:
            org = Organization(id=uuid.uuid4(), name="Dev Org", slug="dev")
            db.add(org)
            await db.flush()
            print(f"Created org: {org.name} (id: {org.id})")

        membership_result = await db.execute(
            select(UserOrg).where(UserOrg.user_id == user.id, UserOrg.org_id == org.id)
        )
        if not membership_result.scalar_one_or_none():
            db.add(UserOrg(user_id=user.id, org_id=org.id, role="admin"))
            print(f"  Added {user.email} to org {org.name}")

        # Create sample conversations
        sample_titles = [
            "Python debugging help",
            "Architecture review",
            "Data pipeline design",
        ]
        for title in sample_titles:
            existing = await db.execute(
                select(Conversation).where(
                    Conversation.user_id == user.id,
                    Conversation.title == title,
                )
            )
            if not existing.scalar_one_or_none():
                conv = Conversation(
                    id=uuid.uuid4(),
                    org_id=org.id,
                    user_id=user.id,
                    title=title,
                    model="azure_ai/claude-sonnet-4-5-swc",
                )
                db.add(conv)
                print(f"  Created conversation: {title}")

        # Ensure a system user exists for marketplace seed agents
        sys_result = await db.execute(select(User).where(User.email == SYSTEM_USER_EMAIL))
        system_user = sys_result.scalar_one_or_none()
        if not system_user:
            system_user = User(
                id=uuid.uuid4(),
                workos_id=f"system_{uuid.uuid4().hex[:8]}",
                email=SYSTEM_USER_EMAIL,
                name=SYSTEM_USER_NAME,
            )
            db.add(system_user)
            await db.flush()
            print(f"Created system user: {system_user.email} (id: {system_user.id})")
        else:
            print(f"System user already exists: {system_user.email}")

        # Seed public agents under the system user (visible in marketplace, not in any user's agent list)
        for agent_data in SEED_AGENTS:
            existing = await db.execute(
                select(AgentPersona).where(
                    AgentPersona.user_id == system_user.id,
                    AgentPersona.name == agent_data["name"],
                )
            )
            if not existing.scalar_one_or_none():
                persona = AgentPersona(
                    id=uuid.uuid4(),
                    user_id=system_user.id,
                    org_id=org.id,
                    name=agent_data["name"],
                    description=agent_data["description"],
                    system_prompt=agent_data["system_prompt"],
                    icon=agent_data["icon"],
                    category=agent_data["category"],
                    is_public=True,
                    default_mode="chat",
                )
                db.add(persona)
                print(f"  Created marketplace agent: {agent_data['name']}")
            else:
                print(f"  Marketplace agent already exists: {agent_data['name']}")

        await db.commit()
        print("\nSeed complete!")
        print(f"\nTo log in as the dev user, use email: {TEST_USER_EMAIL}")
        print("(Password auth bypasses WorkOS in DEV_MODE)")


if __name__ == "__main__":
    asyncio.run(seed())
