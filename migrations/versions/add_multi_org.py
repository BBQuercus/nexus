"""Add multi-org foundation: organizations, user_orgs, org_id on all scoped tables, RLS

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-03-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


# revision identifiers, used by Alembic.
revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Tables that get org_id (non-nullable FK to organizations)
ORG_SCOPED_TABLES = [
    "conversations",
    "messages",
    "artifacts",
    "projects",
    "agent_personas",
    "knowledge_bases",
    "documents",
    "chunks",
    "memories",
    "usage_logs",
    "feedback",
    "analytics_events",
    "retrieval_logs",
    "knowledge_base_agents",
]

# Tables that get nullable org_id (platform-level events, error reports)
NULLABLE_ORG_TABLES = ["audit_events", "frontend_errors"]

# All tables that get RLS policies
RLS_TABLES = ORG_SCOPED_TABLES + NULLABLE_ORG_TABLES


def upgrade() -> None:
    # 1. Create organizations table
    op.create_table(
        "organizations",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=True),
        sa.Column("settings", JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )

    # 2. Create user_orgs table
    op.create_table(
        "user_orgs",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="editor"),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "org_id"),
    )
    op.create_index("idx_user_orgs_user", "user_orgs", ["user_id"])
    op.create_index("idx_user_orgs_org", "user_orgs", ["org_id"])

    # 3. Update users table: drop is_admin and role, add is_superadmin
    op.drop_column("users", "is_admin")
    op.drop_column("users", "role")
    op.add_column(
        "users",
        sa.Column("is_superadmin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # 4. Create a default placeholder org for the migration
    # (DB will be nuked anyway, but this lets the migration run on existing data)
    op.execute("""
        INSERT INTO organizations (id, name, slug)
        VALUES ('00000000-0000-0000-0000-000000000001', 'Default', 'default')
        ON CONFLICT (slug) DO NOTHING
    """)

    # 5. Discover which tables actually exist (some are optional, e.g. chunks needs pgvector)
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    existing_scoped = [t for t in ORG_SCOPED_TABLES if t in existing_tables]
    existing_nullable = [t for t in NULLABLE_ORG_TABLES if t in existing_tables]
    existing_rls = existing_scoped + existing_nullable

    # 6. Add org_id to all scoped tables (non-nullable with default placeholder)
    for table in existing_scoped:
        op.add_column(
            table,
            sa.Column(
                "org_id",
                UUID(as_uuid=True),
                nullable=False,
                server_default=sa.text("'00000000-0000-0000-0000-000000000001'"),
            ),
        )
        op.create_foreign_key(f"fk_{table}_org_id", table, "organizations", ["org_id"], ["id"])
        op.create_index(f"idx_{table}_org", table, ["org_id"])

    # Add nullable org_id to audit_events
    for table in existing_nullable:
        op.add_column(
            table,
            sa.Column("org_id", UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(f"fk_{table}_org_id", table, "organizations", ["org_id"], ["id"])
        op.create_index(f"idx_{table}_org", table, ["org_id"])

    # 7. Drop the server_default placeholder now that column exists
    for table in existing_scoped:
        op.alter_column(table, "org_id", server_default=None)

    # 8. Enable RLS and create policies on all scoped tables
    for table in existing_rls:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

        # Org isolation policy: only see rows in the active org
        # Use current_setting with missing_ok=true so queries don't error when the
        # setting hasn't been SET yet (returns empty string → UUID cast fails → no rows).
        op.execute(f"""
            CREATE POLICY {table}_org_isolation ON {table}
            USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
        """)

        # Superadmin bypass: sees all rows
        op.execute(f"""
            CREATE POLICY {table}_superadmin ON {table}
            USING (current_setting('app.is_superadmin', true)::boolean = true)
        """)

    # 8. Clean up placeholder org (DB will be nuked before real use)
    # Left intentionally — seed script will create real orgs


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    existing_rls = [t for t in (ORG_SCOPED_TABLES + NULLABLE_ORG_TABLES) if t in existing_tables]
    existing_nullable = [t for t in NULLABLE_ORG_TABLES if t in existing_tables]
    existing_scoped = [t for t in ORG_SCOPED_TABLES if t in existing_tables]

    # Drop RLS policies and disable RLS
    for table in existing_rls:
        op.execute(f"DROP POLICY IF EXISTS {table}_superadmin ON {table}")
        op.execute(f"DROP POLICY IF EXISTS {table}_org_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    # Drop org_id from all tables
    for table in existing_nullable:
        op.drop_index(f"idx_{table}_org", table_name=table)
        op.drop_constraint(f"fk_{table}_org_id", table, type_="foreignkey")
        op.drop_column(table, "org_id")

    for table in existing_scoped:
        op.drop_index(f"idx_{table}_org", table_name=table)
        op.drop_constraint(f"fk_{table}_org_id", table, type_="foreignkey")
        op.drop_column(table, "org_id")

    # Restore users columns
    op.drop_column("users", "is_superadmin")
    op.add_column("users", sa.Column("role", sa.String(), nullable=True))
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # Drop tables
    op.drop_table("user_orgs")
    op.drop_table("organizations")
