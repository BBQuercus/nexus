"""Add role column to users table

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-03-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('role', sa.String(), nullable=True))
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    user_columns = {column["name"] for column in inspector.get_columns("users")}

    if "is_admin" in user_columns:
        op.execute("UPDATE users SET role = 'admin' WHERE is_admin = true")
        op.execute("UPDATE users SET role = 'editor' WHERE is_admin = false OR is_admin IS NULL")
    else:
        # Fresh databases created from the current base schema may not include
        # the legacy is_admin column, so default existing users to editor.
        op.execute("UPDATE users SET role = 'editor' WHERE role IS NULL")


def downgrade() -> None:
    op.drop_column('users', 'role')
