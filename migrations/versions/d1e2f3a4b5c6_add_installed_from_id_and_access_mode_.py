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
    # knowledge_bases lives in the vector DB, not the main DB.
    # These columns are now added via ensure_vector_schema() in vector_db.py.
    pass


def downgrade() -> None:
    pass
