"""Add platform feature tables for all roadmap phases

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-03-27

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = "f2a3b4c5d6e7"
down_revision: str | None = "e1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -- Add new columns to agent_personas --
    # knowledge_base_ids was in the model but missing from earlier migrations
    op.add_column("agent_personas", sa.Column("knowledge_base_ids", sa.JSON(), nullable=True))
    op.add_column("agent_personas", sa.Column("approval_config", JSONB(), nullable=True))
    op.add_column("agent_personas", sa.Column("input_schema", JSONB(), nullable=True))
    op.add_column("agent_personas", sa.Column("output_schema", JSONB(), nullable=True))
    op.add_column("agent_personas", sa.Column("current_version", sa.Integer(), server_default=sa.text("1"), nullable=False))

    # -- Phase 1: Approval Gates & Agent Workflows --

    op.create_table(
        "agent_runs",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("agent_persona_id", sa.UUID(), nullable=True),
        sa.Column("conversation_id", sa.UUID(), nullable=True),
        sa.Column("template_id", sa.UUID(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="running"),
        sa.Column("input_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("input_variables", JSONB(), nullable=True),
        sa.Column("output_text", sa.Text(), nullable=True),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("tool_calls", JSONB(), nullable=True),
        sa.Column("total_input_tokens", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("total_output_tokens", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("cost_usd", sa.Numeric(10, 6), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("trigger", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("parent_run_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["agent_persona_id"], ["agent_personas.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["parent_run_id"], ["agent_runs.id"]),
    )
    op.create_index("ix_agent_runs_org_id", "agent_runs", ["org_id"])
    op.create_index("ix_agent_runs_user_id", "agent_runs", ["user_id"])
    op.create_index("ix_agent_runs_agent_persona_id", "agent_runs", ["agent_persona_id"])

    op.create_table(
        "agent_run_steps",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("agent_run_id", sa.UUID(), nullable=False),
        sa.Column("step_index", sa.Integer(), nullable=False),
        sa.Column("step_type", sa.String(20), nullable=False),
        sa.Column("tool_name", sa.String(100), nullable=True),
        sa.Column("input_data", JSONB(), nullable=True),
        sa.Column("output_data", JSONB(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("tokens_used", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="completed"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_runs.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_agent_run_steps_agent_run_id", "agent_run_steps", ["agent_run_id"])

    op.create_table(
        "approval_gates",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("agent_run_id", sa.UUID(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("tool_name", sa.String(100), nullable=False),
        sa.Column("tool_arguments", JSONB(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("decided_by", sa.UUID(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("edited_arguments", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["decided_by"], ["users.id"]),
    )
    op.create_index("ix_approval_gates_org_id", "approval_gates", ["org_id"])
    op.create_index("ix_approval_gates_agent_run_id", "approval_gates", ["agent_run_id"])
    op.create_index("ix_approval_gates_conversation_id", "approval_gates", ["conversation_id"])

    op.create_table(
        "prompt_templates",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("agent_persona_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("template", sa.Text(), nullable=False),
        sa.Column("variables", JSONB(), nullable=True),
        sa.Column("is_public", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["agent_persona_id"], ["agent_personas.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_prompt_templates_org_id", "prompt_templates", ["org_id"])

    op.create_table(
        "agent_schedules",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("agent_persona_id", sa.UUID(), nullable=False),
        sa.Column("template_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("cron_expression", sa.String(100), nullable=False),
        sa.Column("input_text", sa.Text(), nullable=True),
        sa.Column("input_variables", JSONB(), nullable=True),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["agent_persona_id"], ["agent_personas.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id"], ["prompt_templates.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_agent_schedules_org_id", "agent_schedules", ["org_id"])
    op.create_index("ix_agent_schedules_agent_persona_id", "agent_schedules", ["agent_persona_id"])

    op.create_table(
        "agent_versions",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("agent_persona_id", sa.UUID(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column("tools_enabled", sa.JSON(), nullable=True),
        sa.Column("knowledge_base_ids", sa.JSON(), nullable=True),
        sa.Column("input_schema", JSONB(), nullable=True),
        sa.Column("output_schema", JSONB(), nullable=True),
        sa.Column("approval_config", JSONB(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["agent_persona_id"], ["agent_personas.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["published_by"], ["users.id"]),
    )
    op.create_index("ix_agent_versions_agent_persona_id", "agent_versions", ["agent_persona_id"])

    # Add FK for agent_runs.template_id (now that prompt_templates exists)
    op.create_foreign_key("fk_agent_runs_template_id", "agent_runs", "prompt_templates", ["template_id"], ["id"], ondelete="SET NULL")

    # -- Phase 2: Tool Wiring & Structured Artifacts --

    op.create_table(
        "connectors",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("connector_type", sa.String(50), nullable=False),
        sa.Column("scope", sa.String(20), nullable=False, server_default="personal"),
        sa.Column("config", JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("auth_type", sa.String(20), nullable=False, server_default="none"),
        sa.Column("auth_credentials_encrypted", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_test_status", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )
    op.create_index("ix_connectors_org_id", "connectors", ["org_id"])

    op.create_table(
        "connector_agents",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("connector_id", sa.UUID(), nullable=False),
        sa.Column("agent_persona_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["connector_id"], ["connectors.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agent_persona_id"], ["agent_personas.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("connector_id", "agent_persona_id"),
    )
    op.create_index("ix_connector_agents_connector_id", "connector_agents", ["connector_id"])
    op.create_index("ix_connector_agents_agent_persona_id", "connector_agents", ["agent_persona_id"])

    # -- Phase 3: Action Layer --

    op.create_table(
        "external_actions",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("agent_run_id", sa.UUID(), nullable=True),
        sa.Column("action_type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("preview", JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("result", JSONB(), nullable=True),
        sa.Column("approved_by", sa.UUID(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_runs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"]),
    )
    op.create_index("ix_external_actions_org_id", "external_actions", ["org_id"])

    # -- Phase 4: Evaluation & Debugging --

    op.create_table(
        "test_cases",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("agent_persona_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("input_text", sa.Text(), nullable=False),
        sa.Column("input_variables", JSONB(), nullable=True),
        sa.Column("expected_output", sa.Text(), nullable=True),
        sa.Column("expected_tool_calls", JSONB(), nullable=True),
        sa.Column("evaluation_criteria", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["agent_persona_id"], ["agent_personas.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_test_cases_org_id", "test_cases", ["org_id"])
    op.create_index("ix_test_cases_agent_persona_id", "test_cases", ["agent_persona_id"])

    op.create_table(
        "test_runs",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("agent_persona_id", sa.UUID(), nullable=False),
        sa.Column("triggered_by", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="running"),
        sa.Column("total_cases", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("passed", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("failed", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("results", JSONB(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["agent_persona_id"], ["agent_personas.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["triggered_by"], ["users.id"]),
    )
    op.create_index("ix_test_runs_org_id", "test_runs", ["org_id"])
    op.create_index("ix_test_runs_agent_persona_id", "test_runs", ["agent_persona_id"])

    # -- Phase 5: Voice & Meeting Workflows --

    op.create_table(
        "transcripts",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("source", sa.String(50), nullable=False, server_default="upload"),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("language", sa.String(10), nullable=False, server_default="en"),
        sa.Column("full_text", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("action_items", JSONB(), nullable=True),
        sa.Column("speaker_count", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="processing"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_transcripts_org_id", "transcripts", ["org_id"])

    op.create_table(
        "transcript_segments",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("transcript_id", sa.UUID(), nullable=False),
        sa.Column("speaker_label", sa.String(100), nullable=False),
        sa.Column("speaker_name", sa.String(255), nullable=True),
        sa.Column("start_ms", sa.Integer(), nullable=False),
        sa.Column("end_ms", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Numeric(5, 4), nullable=True),
        sa.Column("segment_index", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["transcript_id"], ["transcripts.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_transcript_segments_transcript_id", "transcript_segments", ["transcript_id"])

    # -- Phase 6: Agent Marketplace --

    op.create_table(
        "marketplace_listings",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("agent_persona_id", sa.UUID(), nullable=False),
        sa.Column("publisher_id", sa.UUID(), nullable=False),
        sa.Column("visibility", sa.String(20), nullable=False, server_default="public"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("tags", JSONB(), nullable=True),
        sa.Column("version", sa.String(20), nullable=False, server_default="1.0.0"),
        sa.Column("install_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("avg_rating", sa.Numeric(3, 2), nullable=True),
        sa.Column("rating_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("featured", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["agent_persona_id"], ["agent_personas.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["publisher_id"], ["users.id"]),
    )
    op.create_index("ix_marketplace_listings_org_id", "marketplace_listings", ["org_id"])
    op.create_index("ix_marketplace_listings_agent_persona_id", "marketplace_listings", ["agent_persona_id"])

    op.create_table(
        "agent_ratings",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("marketplace_listing_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("review", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["marketplace_listing_id"], ["marketplace_listings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.UniqueConstraint("marketplace_listing_id", "user_id"),
    )
    op.create_index("ix_agent_ratings_marketplace_listing_id", "agent_ratings", ["marketplace_listing_id"])


def downgrade() -> None:
    op.drop_table("agent_ratings")
    op.drop_table("marketplace_listings")
    op.drop_table("transcript_segments")
    op.drop_table("transcripts")
    op.drop_table("test_runs")
    op.drop_table("test_cases")
    op.drop_table("external_actions")
    op.drop_table("connector_agents")
    op.drop_table("connectors")
    op.drop_constraint("fk_agent_runs_template_id", "agent_runs", type_="foreignkey")
    op.drop_table("agent_versions")
    op.drop_table("agent_schedules")
    op.drop_table("prompt_templates")
    op.drop_table("approval_gates")
    op.drop_table("agent_run_steps")
    op.drop_table("agent_runs")
    op.drop_column("agent_personas", "current_version")
    op.drop_column("agent_personas", "output_schema")
    op.drop_column("agent_personas", "input_schema")
    op.drop_column("agent_personas", "approval_config")
    op.drop_column("agent_personas", "knowledge_base_ids")
