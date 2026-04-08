"""Add category to agent_personas

Revision ID: a1b2c3d4e5f6
Revises: f2a3b4c5d6e7
Create Date: 2026-03-28

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b3c4d5e6f7a8"
down_revision: str | None = "f2a3b4c5d6e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns WHERE table_name='agent_personas' AND column_name='category'"
    ))
    if not result.fetchone():
        op.add_column("agent_personas", sa.Column("category", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("agent_personas", "category")
