"""add projects table and project_id to conversations

Revision ID: d001_projects
Revises: c3d4e5f6a7b8
Create Date: 2026-03-24 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'd001_projects'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create projects table
    op.create_table(
        'projects',
        sa.Column('id', UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('icon', sa.String(), nullable=True),
        sa.Column('color', sa.String(), nullable=True),
        sa.Column('default_model', sa.String(), nullable=True),
        sa.Column('default_persona_id', UUID(as_uuid=True), nullable=True),
        sa.Column('knowledge_base_ids', sa.JSON(), nullable=True),
        sa.Column('pinned_conversation_ids', sa.JSON(), nullable=True),
        sa.Column('settings', sa.JSON(), nullable=True),
        sa.Column('archived', sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['default_persona_id'], ['agent_personas.id']),
    )
    op.create_index('ix_projects_user_id', 'projects', ['user_id'])

    # Add project_id FK to conversations
    op.add_column('conversations', sa.Column('project_id', UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_conversations_project_id', 'conversations', 'projects',
        ['project_id'], ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_conversations_project_id', 'conversations', ['project_id'])


def downgrade() -> None:
    op.drop_index('ix_conversations_project_id', table_name='conversations')
    op.drop_constraint('fk_conversations_project_id', 'conversations', type_='foreignkey')
    op.drop_column('conversations', 'project_id')
    op.drop_index('ix_projects_user_id', table_name='projects')
    op.drop_table('projects')
