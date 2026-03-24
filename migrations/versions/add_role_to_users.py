"""Add role column to users table

Revision ID: e5f6a7b8c9d0
Revises: a001_audit_events
Create Date: 2026-03-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'a001_audit_events'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('role', sa.String(), nullable=True))
    # Backfill: set existing admins to 'admin' role, others to 'editor'
    op.execute("UPDATE users SET role = 'admin' WHERE is_admin = true")
    op.execute("UPDATE users SET role = 'editor' WHERE is_admin = false OR is_admin IS NULL")


def downgrade() -> None:
    op.drop_column('users', 'role')
