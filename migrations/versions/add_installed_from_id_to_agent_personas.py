"""Add installed_from_id to agent_personas

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-03-28

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4d5e6f7a8b9"
down_revision: str | None = "b3c4d5e6f7a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("agent_personas", sa.Column("installed_from_id", sa.UUID(), nullable=True))


def downgrade() -> None:
    op.drop_column("agent_personas", "installed_from_id")
