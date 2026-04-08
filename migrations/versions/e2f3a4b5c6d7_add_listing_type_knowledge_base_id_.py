"""Add listing_type, knowledge_base_id, access_mode to marketplace_listings

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-03-28 02:06:17.554239

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("marketplace_listings", sa.Column("listing_type", sa.String(20), nullable=True))
    op.add_column("marketplace_listings", sa.Column("knowledge_base_id", sa.UUID(), nullable=True))
    op.add_column("marketplace_listings", sa.Column("access_mode", sa.String(20), nullable=True))
    # backfill listing_type for existing rows, then make non-nullable
    op.execute("UPDATE marketplace_listings SET listing_type = 'agent' WHERE listing_type IS NULL")
    op.alter_column("marketplace_listings", "listing_type", nullable=False)
    # agent_persona_id was NOT NULL in original migration but model has it nullable
    op.alter_column("marketplace_listings", "agent_persona_id", nullable=True)
    op.create_index("ix_marketplace_listings_knowledge_base_id", "marketplace_listings", ["knowledge_base_id"])


def downgrade() -> None:
    op.drop_index("ix_marketplace_listings_knowledge_base_id", "marketplace_listings")
    op.alter_column("marketplace_listings", "agent_persona_id", nullable=False)
    op.drop_column("marketplace_listings", "access_mode")
    op.drop_column("marketplace_listings", "knowledge_base_id")
    op.drop_column("marketplace_listings", "listing_type")
