"""Add audit_events table.

Revision ID: a001_audit_events
Revises: d001_projects
Create Date: 2026-03-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a001_audit_events'
down_revision: Union[str, None] = 'd001_projects'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'audit_events',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column('action', sa.String(100), nullable=False, index=True),
        sa.Column('actor_id', sa.String(36), nullable=True, index=True),
        sa.Column('resource_type', sa.String(50), nullable=True),
        sa.Column('resource_id', sa.String(36), nullable=True),
        sa.Column('details', postgresql.JSONB, server_default='{}'),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.Text, nullable=True),
        sa.Column('request_id', sa.String(36), nullable=True),
    )
    # Index for common query patterns
    op.create_index('ix_audit_events_actor_action', 'audit_events', ['actor_id', 'action'])
    op.create_index('ix_audit_events_resource', 'audit_events', ['resource_type', 'resource_id'])


def downgrade() -> None:
    op.drop_index('ix_audit_events_resource', table_name='audit_events')
    op.drop_index('ix_audit_events_actor_action', table_name='audit_events')
    op.drop_table('audit_events')
