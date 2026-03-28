"""Add installed_from_id and access_mode to knowledge_bases

Revision ID: d1e2f3a4b5c6
Revises: c4d5e6f7a8b9
Create Date: 2026-03-28 02:03:01.795719

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("knowledge_bases", sa.Column("installed_from_id", sa.UUID(), nullable=True))
    op.add_column("knowledge_bases", sa.Column("access_mode", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("knowledge_bases", "access_mode")
    op.drop_column("knowledge_bases", "installed_from_id")
