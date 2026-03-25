"""add optional feature tables

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-03-25

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9d0e1f2a3b4"
down_revision: str | None = "b8c9d0e1f2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "analytics_events" not in tables:
        op.create_table(
            "analytics_events",
            sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
            sa.Column("user_id", sa.UUID(), nullable=False),
            sa.Column("event_type", sa.String(), nullable=False),
            sa.Column("event_data", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if "knowledge_bases" not in tables:
        op.create_table(
            "knowledge_bases",
            sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
            sa.Column("user_id", sa.UUID(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("embedding_model", sa.String(), nullable=False),
            sa.Column("chunk_strategy", sa.String(), nullable=False),
            sa.Column("document_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
            sa.Column("chunk_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("is_public", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if "documents" not in tables:
        op.create_table(
            "documents",
            sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
            sa.Column("knowledge_base_id", sa.UUID(), nullable=True),
            sa.Column("user_id", sa.UUID(), nullable=False),
            sa.Column("conversation_id", sa.UUID(), nullable=True),
            sa.Column("filename", sa.String(), nullable=False),
            sa.Column("content_type", sa.String(), nullable=False),
            sa.Column("file_size_bytes", sa.Integer(), nullable=False),
            sa.Column("page_count", sa.Integer(), nullable=True),
            sa.Column("raw_text", sa.Text(), nullable=True),
            sa.Column("metadata", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["knowledge_base_id"], ["knowledge_bases.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_documents_knowledge_base_id", "documents", ["knowledge_base_id"])
        op.create_index("ix_documents_conversation_id", "documents", ["conversation_id"])

    if "knowledge_base_agents" not in tables:
        op.create_table(
            "knowledge_base_agents",
            sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
            sa.Column("knowledge_base_id", sa.UUID(), nullable=False),
            sa.Column("agent_persona_id", sa.UUID(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["agent_persona_id"], ["agent_personas.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["knowledge_base_id"], ["knowledge_bases.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    if "retrieval_logs" not in tables:
        op.create_table(
            "retrieval_logs",
            sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
            sa.Column("message_id", sa.UUID(), nullable=True),
            sa.Column("query", sa.Text(), nullable=False),
            sa.Column("rewritten_queries", sa.JSON(), nullable=True),
            sa.Column("chunks_retrieved", sa.JSON(), nullable=True),
            sa.Column("total_candidates", sa.Integer(), nullable=False),
            sa.Column("retrieval_time_ms", sa.Integer(), nullable=False),
            sa.Column("rerank_time_ms", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_retrieval_logs_message_id", "retrieval_logs", ["message_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "retrieval_logs" in tables:
        indexes = {idx["name"] for idx in inspector.get_indexes("retrieval_logs")}
        if "ix_retrieval_logs_message_id" in indexes:
            op.drop_index("ix_retrieval_logs_message_id", table_name="retrieval_logs")
        op.drop_table("retrieval_logs")

    if "knowledge_base_agents" in tables:
        op.drop_table("knowledge_base_agents")

    if "documents" in tables:
        indexes = {idx["name"] for idx in inspector.get_indexes("documents")}
        if "ix_documents_conversation_id" in indexes:
            op.drop_index("ix_documents_conversation_id", table_name="documents")
        if "ix_documents_knowledge_base_id" in indexes:
            op.drop_index("ix_documents_knowledge_base_id", table_name="documents")
        op.drop_table("documents")

    if "knowledge_bases" in tables:
        op.drop_table("knowledge_bases")

    if "analytics_events" in tables:
        op.drop_table("analytics_events")
