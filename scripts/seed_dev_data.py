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
from backend.models import User, Conversation, AgentPersona


TEST_USER_EMAIL = "dev@nexus.local"
TEST_USER_NAME = "Dev User"


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
                role="admin",
                is_admin=True,
            )
            db.add(user)
            await db.flush()
            print(f"Created test user: {user.email} (id: {user.id})")

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
                    user_id=user.id,
                    title=title,
                    model="azure_ai/claude-sonnet-4-5-swc",
                )
                db.add(conv)
                print(f"  Created conversation: {title}")

        # Create sample agent persona
        existing = await db.execute(
            select(AgentPersona).where(
                AgentPersona.user_id == user.id,
                AgentPersona.name == "Code Reviewer",
            )
        )
        if not existing.scalar_one_or_none():
            persona = AgentPersona(
                id=uuid.uuid4(),
                user_id=user.id,
                name="Code Reviewer",
                description="Reviews code for best practices, security issues, and performance.",
                system_prompt="You are an expert code reviewer. Focus on security, performance, and maintainability.",
                model="azure_ai/claude-sonnet-4-5-swc",
            )
            db.add(persona)
            print("  Created agent persona: Code Reviewer")

        await db.commit()
        print("\nSeed complete!")
        print(f"\nTo log in as the dev user, use email: {TEST_USER_EMAIL}")
        print("(Password auth bypasses WorkOS in DEV_MODE)")


if __name__ == "__main__":
    asyncio.run(seed())
