"""add branching support to messages

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-23 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add branching columns to messages
    op.add_column('messages', sa.Column('parent_id', UUID(as_uuid=True), nullable=True))
    op.add_column('messages', sa.Column('branch_index', sa.Integer(), server_default='0', nullable=False))
    op.create_foreign_key('fk_messages_parent_id', 'messages', 'messages', ['parent_id'], ['id'])
    op.create_index('ix_messages_parent_id', 'messages', ['parent_id'])

    # Add active_leaf_id to conversations
    op.add_column('conversations', sa.Column('active_leaf_id', UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_conversations_active_leaf_id', 'conversations', 'messages',
        ['active_leaf_id'], ['id'],
        use_alter=True,
    )

    # Backfill: chain existing messages by created_at order
    op.execute("""
        WITH ordered AS (
            SELECT id, conversation_id,
                   LAG(id) OVER (PARTITION BY conversation_id ORDER BY created_at) AS prev_id
            FROM messages
        )
        UPDATE messages SET parent_id = ordered.prev_id
        FROM ordered WHERE messages.id = ordered.id
    """)

    # Backfill: set active_leaf_id to last message per conversation
    op.execute("""
        UPDATE conversations SET active_leaf_id = sub.last_msg_id
        FROM (
            SELECT DISTINCT ON (conversation_id) conversation_id, id AS last_msg_id
            FROM messages
            ORDER BY conversation_id, created_at DESC
        ) sub
        WHERE conversations.id = sub.conversation_id
    """)


def downgrade() -> None:
    op.drop_constraint('fk_conversations_active_leaf_id', 'conversations', type_='foreignkey')
    op.drop_column('conversations', 'active_leaf_id')
    op.drop_index('ix_messages_parent_id', table_name='messages')
    op.drop_constraint('fk_messages_parent_id', 'messages', type_='foreignkey')
    op.drop_column('messages', 'branch_index')
    op.drop_column('messages', 'parent_id')
