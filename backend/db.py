import uuid
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from backend.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,  # Base connections
    max_overflow=20,  # Extra connections under load
    pool_timeout=30,  # Seconds to wait for connection
    pool_recycle=1800,  # Recycle connections after 30 min
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Raw DB session without org scoping. Use for auth and non-tenant queries."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_org_scoped_db(
    org_id: uuid.UUID,
    is_superadmin: bool = False,
) -> AsyncGenerator[AsyncSession, None]:
    """DB session with RLS org context via SET LOCAL.

    The org_id and is_superadmin parameters are injected by FastAPI's dependency
    system — see backend/auth.py for get_current_org() and get_is_superadmin().
    """
    async with async_session() as session:
        try:
            # SET LOCAL scopes to the current transaction — safe with pooling
            await session.execute(text(f"SET LOCAL app.current_org_id = '{org_id}'"))
            if is_superadmin:
                await session.execute(text("SET LOCAL app.is_superadmin = 'true'"))
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
