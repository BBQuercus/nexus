"""Add knowledge_base_ids to conversations.

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    conversation_columns = {column["name"] for column in inspector.get_columns("conversations")}

    if "knowledge_base_ids" not in conversation_columns:
        op.add_column("conversations", sa.Column("knowledge_base_ids", sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    conversation_columns = {column["name"] for column in inspector.get_columns("conversations")}

    if "knowledge_base_ids" in conversation_columns:
        op.drop_column("conversations", "knowledge_base_ids")
