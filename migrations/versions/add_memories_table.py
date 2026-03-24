"""add memories table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-03-24 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'memories',
        sa.Column('id', UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='SET NULL'), nullable=True),
        sa.Column('scope', sa.String(), nullable=False, server_default='global'),
        sa.Column('category', sa.String(), nullable=False, server_default='preference'),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('source_conversation_id', UUID(as_uuid=True), nullable=True),
        sa.Column('source_message_id', UUID(as_uuid=True), nullable=True),
        sa.Column('relevance_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_memories_user_id', 'memories', ['user_id'])
    op.create_index('ix_memories_user_scope', 'memories', ['user_id', 'scope'])
    op.create_index('ix_memories_project_id', 'memories', ['project_id'])


def downgrade() -> None:
    op.drop_index('ix_memories_project_id')
    op.drop_index('ix_memories_user_scope')
    op.drop_index('ix_memories_user_id')
    op.drop_table('memories')
