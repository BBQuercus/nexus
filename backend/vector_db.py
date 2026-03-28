from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.config import settings
from backend.logging_config import get_logger

logger = get_logger("vector_db")

vector_engine = create_async_engine(
    settings.vector_database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,
    pool_recycle=1800,
)

vector_async_session = async_sessionmaker(vector_engine, class_=AsyncSession, expire_on_commit=False)


async def get_vector_db() -> AsyncGenerator[AsyncSession, None]:
    async with vector_async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def ensure_vector_schema() -> None:
    """Create vector-backed feature tables in the pgvector database.

    This schema intentionally omits cross-database foreign keys to primary app
    tables such as users/conversations/messages.
    """
    async with vector_engine.begin() as conn:
        vector_available = True
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        except Exception as exc:
            logger.warning("pgcrypto_extension_create_failed", error=str(exc))
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        except Exception as exc:
            vector_available = False
            logger.warning("pgvector_extension_create_failed", error=str(exc))

        statements = [
            """
            CREATE TABLE IF NOT EXISTS analytics_events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL,
                event_type VARCHAR NOT NULL,
                event_data JSON NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS knowledge_bases (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL,
                name VARCHAR NOT NULL,
                description TEXT NULL,
                embedding_model VARCHAR NOT NULL DEFAULT 'text-embedding-3-small',
                chunk_strategy VARCHAR NOT NULL DEFAULT 'contextual',
                document_count INTEGER NOT NULL DEFAULT 0,
                chunk_count INTEGER NOT NULL DEFAULT 0,
                status VARCHAR NOT NULL DEFAULT 'ready',
                is_public BOOLEAN NOT NULL DEFAULT false,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS documents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                knowledge_base_id UUID NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
                user_id UUID NOT NULL,
                conversation_id UUID NULL,
                filename VARCHAR NOT NULL,
                content_type VARCHAR NOT NULL,
                file_size_bytes INTEGER NOT NULL,
                page_count INTEGER NULL,
                raw_text TEXT NULL,
                metadata JSON NULL,
                status VARCHAR NOT NULL DEFAULT 'processing',
                error_message TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS knowledge_base_agents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                knowledge_base_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
                agent_persona_id UUID NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS retrieval_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                message_id UUID NULL,
                query TEXT NOT NULL,
                rewritten_queries JSON NULL,
                chunks_retrieved JSON NULL,
                total_candidates INTEGER NOT NULL DEFAULT 0,
                retrieval_time_ms INTEGER NOT NULL DEFAULT 0,
                rerank_time_ms INTEGER NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """,
            "CREATE INDEX IF NOT EXISTS ix_documents_knowledge_base_id ON documents (knowledge_base_id)",
            "CREATE INDEX IF NOT EXISTS ix_documents_conversation_id ON documents (conversation_id)",
            "CREATE INDEX IF NOT EXISTS ix_retrieval_logs_message_id ON retrieval_logs (message_id)",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_stage VARCHAR(20)",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS chunks_total INTEGER",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS chunks_done INTEGER",
        ]
        for statement in statements:
            await conn.execute(text(statement))

        if not vector_available:
            logger.warning("vector_schema_skipped_no_extension")
            return

        vector_statements = [
            """
            CREATE TABLE IF NOT EXISTS chunks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                knowledge_base_id UUID NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
                conversation_id UUID NULL,
                content TEXT NOT NULL,
                context_prefix TEXT NULL,
                chunk_index INTEGER NOT NULL,
                page_number INTEGER NULL,
                section_title VARCHAR NULL,
                embedding vector(1536) NULL,
                token_count INTEGER NOT NULL DEFAULT 0,
                metadata JSON NULL,
                tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """,
            # org_id has no FK — organizations lives in the main DB, not the vector DB
            "ALTER TABLE chunks ADD COLUMN IF NOT EXISTS org_id UUID",
            "CREATE INDEX IF NOT EXISTS ix_chunks_org_id ON chunks (org_id)",
            "CREATE INDEX IF NOT EXISTS ix_chunks_document_id ON chunks (document_id)",
            "CREATE INDEX IF NOT EXISTS ix_chunks_knowledge_base_id ON chunks (knowledge_base_id)",
            "CREATE INDEX IF NOT EXISTS ix_chunks_conversation_id ON chunks (conversation_id)",
            "CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON chunks USING gin (tsv)",
        ]
        for statement in vector_statements:
            await conn.execute(text(statement))
