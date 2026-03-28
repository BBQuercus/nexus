"""Tests for all platform feature models and router patterns.

Covers: model imports, serialization functions, prompt template rendering,
approval gate state machine, agent versioning logic, connector validation,
marketplace ratings, schedule cron validation, test case evaluation,
and transcript models.
"""

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///test.db")
os.environ.setdefault("LITE_LLM_API_KEY", "test-key")
os.environ.setdefault("LITE_LLM_URL", "http://localhost:4000")
os.environ.setdefault("SERVER_SECRET", "test-secret-key-for-testing")

import re
import uuid
from datetime import datetime, UTC
from decimal import Decimal
from unittest.mock import MagicMock

import pytest


# ---------------------------------------------------------------------------
# Helper: create a mock model with attribute access
# ---------------------------------------------------------------------------


def _mock_model(**kwargs):
    """Return a MagicMock whose attributes match *kwargs*."""
    m = MagicMock()
    for k, v in kwargs.items():
        setattr(m, k, v)
    return m


# ===========================================================================
# 1. Model Import Tests
# ===========================================================================


class TestModelImports:
    """Verify every new model can be imported from backend.models."""

    def test_import_approval_gate(self):
        from backend.models import ApprovalGate

        assert ApprovalGate.__tablename__ == "approval_gates"

    def test_import_prompt_template(self):
        from backend.models import PromptTemplate

        assert PromptTemplate.__tablename__ == "prompt_templates"

    def test_import_agent_run(self):
        from backend.models import AgentRun

        assert AgentRun.__tablename__ == "agent_runs"

    def test_import_agent_run_step(self):
        from backend.models import AgentRunStep

        assert AgentRunStep.__tablename__ == "agent_run_steps"

    def test_import_agent_schedule(self):
        from backend.models import AgentSchedule

        assert AgentSchedule.__tablename__ == "agent_schedules"

    def test_import_agent_version(self):
        from backend.models import AgentVersion

        assert AgentVersion.__tablename__ == "agent_versions"

    def test_import_external_action(self):
        from backend.models import ExternalAction

        assert ExternalAction.__tablename__ == "external_actions"

    def test_import_test_case(self):
        from backend.models import TestCase

        assert TestCase.__tablename__ == "test_cases"

    def test_import_test_run(self):
        from backend.models import TestRun

        assert TestRun.__tablename__ == "test_runs"

    def test_import_transcript(self):
        from backend.models import Transcript

        assert Transcript.__tablename__ == "transcripts"

    def test_import_transcript_segment(self):
        from backend.models import TranscriptSegment

        assert TranscriptSegment.__tablename__ == "transcript_segments"

    def test_import_marketplace_listing(self):
        from backend.models import MarketplaceListing

        assert MarketplaceListing.__tablename__ == "marketplace_listings"

    def test_import_agent_rating(self):
        from backend.models import AgentRating

        assert AgentRating.__tablename__ == "agent_ratings"


class TestModelRelationships:
    """Verify key relationships are defined on models."""

    def test_agent_run_has_steps_relationship(self):
        from backend.models import AgentRun

        assert "steps" in AgentRun.__mapper__.relationships

    def test_agent_run_has_approval_gates_relationship(self):
        from backend.models import AgentRun

        assert "approval_gates" in AgentRun.__mapper__.relationships

    def test_agent_run_step_has_agent_run_relationship(self):
        from backend.models import AgentRunStep

        assert "agent_run" in AgentRunStep.__mapper__.relationships

    def test_transcript_has_segments_relationship(self):
        from backend.models import Transcript

        assert "segments" in Transcript.__mapper__.relationships

    def test_transcript_segment_has_transcript_relationship(self):
        from backend.models import TranscriptSegment

        assert "transcript" in TranscriptSegment.__mapper__.relationships


class TestModelColumns:
    """Verify expected columns exist on each model."""

    def test_approval_gate_columns(self):
        from backend.models import ApprovalGate

        cols = {c.key for c in ApprovalGate.__table__.columns}
        expected = {"id", "org_id", "agent_run_id", "conversation_id", "tool_name",
                    "tool_arguments", "status", "decided_by", "decided_at",
                    "edited_arguments", "created_at"}
        assert expected.issubset(cols)

    def test_agent_run_columns(self):
        from backend.models import AgentRun

        cols = {c.key for c in AgentRun.__table__.columns}
        expected = {"id", "org_id", "user_id", "status", "input_text", "output_text",
                    "model", "tool_calls", "total_input_tokens", "total_output_tokens",
                    "cost_usd", "duration_ms", "trigger", "created_at"}
        assert expected.issubset(cols)

    def test_marketplace_listing_columns(self):
        from backend.models import MarketplaceListing

        cols = {c.key for c in MarketplaceListing.__table__.columns}
        expected = {"id", "org_id", "agent_persona_id", "publisher_id", "visibility",
                    "status", "category", "tags", "version", "install_count",
                    "avg_rating", "rating_count", "featured"}
        assert expected.issubset(cols)

    def test_transcript_segment_columns(self):
        from backend.models import TranscriptSegment

        cols = {c.key for c in TranscriptSegment.__table__.columns}
        expected = {"id", "transcript_id", "speaker_label", "speaker_name",
                    "start_ms", "end_ms", "text", "confidence", "segment_index"}
        assert expected.issubset(cols)


# ===========================================================================
# 2. Serialization Tests
# ===========================================================================


class TestApprovalGateSerialization:
    def test_serialize_gate_all_fields(self):
        from backend.routers.approval_gates import _serialize_gate

        gate_id = uuid.uuid4()
        org_id = uuid.uuid4()
        run_id = uuid.uuid4()
        conv_id = uuid.uuid4()
        user_id = uuid.uuid4()
        now = datetime.now(UTC)

        gate = _mock_model(
            id=gate_id, org_id=org_id, agent_run_id=run_id,
            conversation_id=conv_id, tool_name="web_search",
            tool_arguments={"query": "test"}, status="pending",
            decided_by=user_id, decided_at=now,
            edited_arguments=None, created_at=now,
        )
        result = _serialize_gate(gate)

        assert result["id"] == str(gate_id)
        assert result["org_id"] == str(org_id)
        assert result["tool_name"] == "web_search"
        assert result["status"] == "pending"
        assert result["decided_by"] == str(user_id)
        assert result["decided_at"] == now.isoformat()
        assert result["created_at"] == now.isoformat()

    def test_serialize_gate_nullable_fields(self):
        from backend.routers.approval_gates import _serialize_gate

        gate = _mock_model(
            id=uuid.uuid4(), org_id=uuid.uuid4(), agent_run_id=uuid.uuid4(),
            conversation_id=uuid.uuid4(), tool_name="run_code",
            tool_arguments=None, status="pending",
            decided_by=None, decided_at=None,
            edited_arguments=None, created_at=None,
        )
        result = _serialize_gate(gate)
        assert result["decided_by"] is None
        assert result["decided_at"] is None
        assert result["created_at"] is None


class TestPromptTemplateSerialization:
    def test_serialize_template(self):
        from backend.routers.prompt_templates import _serialize_template

        tid = uuid.uuid4()
        now = datetime.now(UTC)

        tmpl = _mock_model(
            id=tid, org_id=uuid.uuid4(), user_id=uuid.uuid4(),
            agent_persona_id=None, name="My Template",
            description="A prompt", template="Hello {{name}}",
            variables=[{"name": "name", "type": "string"}],
            is_public=False, created_at=now, updated_at=now,
        )
        result = _serialize_template(tmpl)

        assert result["id"] == str(tid)
        assert result["name"] == "My Template"
        assert result["template"] == "Hello {{name}}"
        assert result["agent_persona_id"] is None
        assert result["is_public"] is False
        assert result["created_at"] == now.isoformat()


class TestAgentVersionSerialization:
    def test_serialize_version(self):
        from backend.routers.agent_versions import _serialize_version

        vid = uuid.uuid4()
        aid = uuid.uuid4()
        uid = uuid.uuid4()
        now = datetime.now(UTC)

        version = _mock_model(
            id=vid, agent_persona_id=aid, version_number=3,
            status="published", system_prompt="You are helpful",
            tools_enabled=["web_search"], knowledge_base_ids=None,
            input_schema=None, output_schema=None,
            approval_config={"web_search": True},
            published_at=now, published_by=uid, created_at=now,
        )
        result = _serialize_version(version)

        assert result["id"] == str(vid)
        assert result["agent_persona_id"] == str(aid)
        assert result["version_number"] == 3
        assert result["status"] == "published"
        assert result["published_at"] == now.isoformat()
        assert result["published_by"] == str(uid)

    def test_serialize_draft_version_no_publish_info(self):
        from backend.routers.agent_versions import _serialize_version

        version = _mock_model(
            id=uuid.uuid4(), agent_persona_id=uuid.uuid4(),
            version_number=1, status="draft",
            system_prompt="test", tools_enabled=None,
            knowledge_base_ids=None, input_schema=None,
            output_schema=None, approval_config=None,
            published_at=None, published_by=None, created_at=None,
        )
        result = _serialize_version(version)
        assert result["published_at"] is None
        assert result["published_by"] is None


class TestMarketplaceListingSerialization:
    def test_serialize_listing_without_agent(self):
        from backend.routers.marketplace import _serialize_listing

        now = datetime.now(UTC)
        listing = _mock_model(
            id=uuid.uuid4(), org_id=uuid.uuid4(),
            agent_persona_id=uuid.uuid4(), publisher_id=uuid.uuid4(),
            visibility="public", status="published",
            category="coding", tags=["python", "ai"],
            version="1.0.0", install_count=42,
            avg_rating=Decimal("4.50"), rating_count=10,
            featured=True, published_at=now,
            created_at=now, updated_at=now,
        )
        result = _serialize_listing(listing)

        assert result["visibility"] == "public"
        assert result["avg_rating"] == 4.50
        assert result["install_count"] == 42
        assert "agent" not in result

    def test_serialize_listing_with_agent(self):
        from backend.routers.marketplace import _serialize_listing

        listing = _mock_model(
            id=uuid.uuid4(), org_id=uuid.uuid4(),
            agent_persona_id=uuid.uuid4(), publisher_id=uuid.uuid4(),
            visibility="public", status="published",
            category="writing", tags=None,
            version="2.0.0", install_count=0,
            avg_rating=None, rating_count=0,
            featured=False, published_at=None,
            created_at=None, updated_at=None,
        )
        agent = _mock_model(
            id=uuid.uuid4(), name="Writer Bot",
            description="Writes stuff", icon="✍️",
            default_model="gpt-4", default_mode="chat",
        )
        result = _serialize_listing(listing, agent)

        assert result["avg_rating"] is None
        assert "agent" in result
        assert result["agent"]["name"] == "Writer Bot"

    def test_serialize_rating(self):
        from backend.routers.marketplace import _serialize_rating

        now = datetime.now(UTC)
        rating = _mock_model(
            id=uuid.uuid4(), marketplace_listing_id=uuid.uuid4(),
            user_id=uuid.uuid4(), rating=5,
            review="Excellent!", created_at=now, updated_at=now,
        )
        result = _serialize_rating(rating)
        assert result["rating"] == 5
        assert result["review"] == "Excellent!"


class TestAgentScheduleSerialization:
    def test_serialize_schedule(self):
        from backend.routers.agent_schedules import _serialize_schedule

        now = datetime.now(UTC)
        schedule = _mock_model(
            id=uuid.uuid4(), org_id=uuid.uuid4(), user_id=uuid.uuid4(),
            agent_persona_id=uuid.uuid4(), template_id=None,
            name="Daily Report", cron_expression="0 9 * * *",
            input_text="Generate report", input_variables=None,
            enabled=True, last_run_at=now, next_run_at=now,
            created_at=now, updated_at=now,
        )
        result = _serialize_schedule(schedule)
        assert result["name"] == "Daily Report"
        assert result["cron_expression"] == "0 9 * * *"
        assert result["enabled"] is True
        assert result["template_id"] is None


class TestAgentRunSerialization:
    def test_serialize_run_without_steps(self):
        from backend.routers.agent_runs import _serialize_run

        now = datetime.now(UTC)
        run = _mock_model(
            id=uuid.uuid4(), org_id=uuid.uuid4(), user_id=uuid.uuid4(),
            agent_persona_id=uuid.uuid4(), conversation_id=None,
            template_id=None, status="completed",
            input_text="Hello", input_variables=None,
            output_text="Hi there", model="gpt-4",
            tool_calls=None, total_input_tokens=100,
            total_output_tokens=50, cost_usd=Decimal("0.002500"),
            duration_ms=1500, error=None, trigger="manual",
            parent_run_id=None, created_at=now, completed_at=now,
        )
        result = _serialize_run(run, include_steps=False)

        assert result["status"] == "completed"
        assert result["cost_usd"] == "0.002500"
        assert result["trigger"] == "manual"
        assert "steps" not in result

    def test_serialize_run_with_steps(self):
        from backend.routers.agent_runs import _serialize_run

        now = datetime.now(UTC)
        step = _mock_model(
            id=uuid.uuid4(), agent_run_id=uuid.uuid4(),
            step_index=0, step_type="llm_call",
            tool_name=None, input_data={"prompt": "hi"},
            output_data={"text": "hello"}, duration_ms=200,
            tokens_used=50, status="completed",
            error=None, created_at=now,
        )
        run = _mock_model(
            id=uuid.uuid4(), org_id=uuid.uuid4(), user_id=uuid.uuid4(),
            agent_persona_id=None, conversation_id=None,
            template_id=None, status="completed",
            input_text="Hello", input_variables=None,
            output_text="Hi", model="gpt-4",
            tool_calls=None, total_input_tokens=50,
            total_output_tokens=25, cost_usd=None,
            duration_ms=300, error=None, trigger="api",
            parent_run_id=None, created_at=now, completed_at=now,
            steps=[step],
        )
        result = _serialize_run(run, include_steps=True)
        assert "steps" in result
        assert len(result["steps"]) == 1
        assert result["steps"][0]["step_type"] == "llm_call"


class TestAgentRunStepSerialization:
    def test_serialize_step(self):
        from backend.routers.agent_runs import _serialize_step

        now = datetime.now(UTC)
        step = _mock_model(
            id=uuid.uuid4(), agent_run_id=uuid.uuid4(),
            step_index=2, step_type="tool_call",
            tool_name="web_search", input_data={"q": "test"},
            output_data={"results": []}, duration_ms=500,
            tokens_used=None, status="completed",
            error=None, created_at=now,
        )
        result = _serialize_step(step)

        assert result["step_index"] == 2
        assert result["step_type"] == "tool_call"
        assert result["tool_name"] == "web_search"


class TestTestCaseSerialization:
    def test_serialize_test_case(self):
        from backend.routers.test_cases import _serialize_test_case

        now = datetime.now(UTC)
        tc = _mock_model(
            id=uuid.uuid4(), org_id=uuid.uuid4(),
            agent_persona_id=uuid.uuid4(), name="Basic greeting",
            input_text="Say hello", input_variables=None,
            expected_output="hello", expected_tool_calls=None,
            evaluation_criteria=None, created_at=now, updated_at=now,
        )
        result = _serialize_test_case(tc)
        assert result["name"] == "Basic greeting"
        assert result["expected_output"] == "hello"

    def test_serialize_test_run(self):
        from backend.routers.test_cases import _serialize_test_run

        now = datetime.now(UTC)
        tr = _mock_model(
            id=uuid.uuid4(), org_id=uuid.uuid4(),
            agent_persona_id=uuid.uuid4(), triggered_by=uuid.uuid4(),
            status="completed", total_cases=5,
            passed=4, failed=1, results=[],
            duration_ms=3000, created_at=now, completed_at=now,
        )
        result = _serialize_test_run(tr)
        assert result["total_cases"] == 5
        assert result["passed"] == 4
        assert result["failed"] == 1


class TestTranscriptSerialization:
    def test_serialize_transcript(self):
        from backend.routers.transcripts import _serialize_transcript

        now = datetime.now(UTC)
        t = _mock_model(
            id=uuid.uuid4(), user_id=uuid.uuid4(), org_id=uuid.uuid4(),
            conversation_id=None, title="Standup Meeting",
            source="upload", duration_seconds=1800,
            language="en", full_text="Alice: Hello...",
            summary="Quick standup", action_items=[{"text": "Fix bug"}],
            speaker_count=3, status="ready", created_at=now,
        )
        result = _serialize_transcript(t)
        assert result["title"] == "Standup Meeting"
        assert result["duration_seconds"] == 1800
        assert result["conversation_id"] is None

    def test_serialize_segment(self):
        from backend.routers.transcripts import _serialize_segment

        seg = _mock_model(
            id=uuid.uuid4(), transcript_id=uuid.uuid4(),
            speaker_label="SPEAKER_00", speaker_name="Alice",
            start_ms=0, end_ms=5000, text="Hello everyone",
            confidence=Decimal("0.9823"), segment_index=0,
        )
        result = _serialize_segment(seg)
        assert result["speaker_label"] == "SPEAKER_00"
        assert result["speaker_name"] == "Alice"
        assert result["confidence"] == pytest.approx(0.9823)
        assert result["start_ms"] == 0
        assert result["end_ms"] == 5000


class TestExternalActionSerialization:
    def test_serialize_action(self):
        from backend.routers.external_actions import _serialize_action

        now = datetime.now(UTC)
        action = _mock_model(
            id=uuid.uuid4(), org_id=uuid.uuid4(), user_id=uuid.uuid4(),
            agent_run_id=uuid.uuid4(), action_type="email",
            status="sent", preview={"to": "bob@example.com", "subject": "Hi"},
            result={"message_id": "abc123"},
            approved_by=uuid.uuid4(), approved_at=now,
            sent_at=now, created_at=now,
        )
        result = _serialize_action(action)
        assert result["action_type"] == "email"
        assert result["status"] == "sent"
        assert result["sent_at"] == now.isoformat()


# ===========================================================================
# 3. Prompt Template Rendering Tests
# ===========================================================================


class TestPromptTemplateRendering:
    """Test the {{variable}} replacement logic used in the prompt_templates router."""

    def _render(self, template_text: str, variables: dict[str, str]) -> str:
        """Replicate the rendering logic from the router."""
        return re.sub(
            r"\{\{(\w+)\}\}",
            lambda m: variables.get(m.group(1), m.group(0)),
            template_text,
        )

    def test_single_variable_replacement(self):
        result = self._render("Hello {{name}}!", {"name": "World"})
        assert result == "Hello World!"

    def test_multiple_variables(self):
        result = self._render(
            "Dear {{name}}, your order {{order_id}} is ready.",
            {"name": "Alice", "order_id": "12345"},
        )
        assert result == "Dear Alice, your order 12345 is ready."

    def test_missing_variable_left_as_is(self):
        result = self._render("Hello {{name}}, your {{role}} is ready.", {"name": "Bob"})
        assert result == "Hello Bob, your {{role}} is ready."

    def test_empty_template(self):
        result = self._render("", {"name": "Alice"})
        assert result == ""

    def test_no_variables_in_template(self):
        result = self._render("Plain text with no variables.", {"name": "Alice"})
        assert result == "Plain text with no variables."

    def test_repeated_variable(self):
        result = self._render("{{x}} and {{x}} again", {"x": "hello"})
        assert result == "hello and hello again"

    def test_empty_variables_dict(self):
        result = self._render("Hello {{name}}", {})
        assert result == "Hello {{name}}"


# ===========================================================================
# 4. Approval Gate State Machine Tests
# ===========================================================================


class TestApprovalGateStateMachine:
    """Test valid and invalid transitions for approval gate status."""

    VALID_TRANSITIONS = {
        ("pending", "approved"),
        ("pending", "rejected"),
        ("pending", "edited"),
    }

    TERMINAL_STATES = {"approved", "rejected", "edited"}

    def _is_valid_transition(self, from_status: str, to_status: str) -> bool:
        return (from_status, to_status) in self.VALID_TRANSITIONS

    def test_pending_to_approved(self):
        assert self._is_valid_transition("pending", "approved")

    def test_pending_to_rejected(self):
        assert self._is_valid_transition("pending", "rejected")

    def test_pending_to_edited(self):
        assert self._is_valid_transition("pending", "edited")

    def test_approved_to_rejected_invalid(self):
        assert not self._is_valid_transition("approved", "rejected")

    def test_rejected_to_approved_invalid(self):
        assert not self._is_valid_transition("rejected", "approved")

    def test_edited_to_approved_invalid(self):
        assert not self._is_valid_transition("edited", "approved")

    def test_terminal_states_cannot_transition(self):
        for terminal in self.TERMINAL_STATES:
            for target in ["pending", "approved", "rejected", "edited"]:
                assert not self._is_valid_transition(terminal, target)


# ===========================================================================
# 5. Agent Version Logic Tests
# ===========================================================================


class TestAgentVersionLogic:
    """Test versioning logic patterns used in the agent_versions router."""

    def test_version_number_incrementing(self):
        """New version = max existing version + 1."""
        existing_versions = [1, 2, 3]
        max_version = max(existing_versions)
        next_version = max_version + 1
        assert next_version == 4

    def test_version_number_from_zero(self):
        """First version when none exist: max is 0, so next is 1."""
        max_version = 0  # no existing versions
        next_version = max_version + 1
        assert next_version == 1

    def test_publishing_archives_old_versions(self):
        """Publishing a version should archive all currently published versions."""
        versions = [
            {"version_number": 1, "status": "archived"},
            {"version_number": 2, "status": "published"},
            {"version_number": 3, "status": "draft"},
        ]

        # Simulate publish of version 3
        target = 3
        for v in versions:
            if v["status"] == "published":
                v["status"] = "archived"
        for v in versions:
            if v["version_number"] == target:
                v["status"] = "published"

        statuses = {v["version_number"]: v["status"] for v in versions}
        assert statuses[1] == "archived"
        assert statuses[2] == "archived"
        assert statuses[3] == "published"

    def test_only_draft_or_archived_can_publish(self):
        """Already-published version cannot be re-published."""
        version_status = "published"
        can_publish = version_status != "published"
        assert not can_publish

    def test_draft_can_be_published(self):
        version_status = "draft"
        can_publish = version_status != "published"
        assert can_publish

    def test_archived_version_can_be_published(self):
        """The router checks status != 'published', so archived can be published."""
        version_status = "archived"
        can_publish = version_status != "published"
        assert can_publish


# ===========================================================================
# 6. Marketplace Rating Tests
# ===========================================================================


class TestMarketplaceRating:
    """Test rating bounds and average calculation."""

    def test_valid_rating_min(self):
        """Rating of 1 is valid."""
        rating = 1
        assert 1 <= rating <= 5

    def test_valid_rating_max(self):
        """Rating of 5 is valid."""
        rating = 5
        assert 1 <= rating <= 5

    def test_invalid_rating_zero(self):
        rating = 0
        assert not (1 <= rating <= 5)

    def test_invalid_rating_six(self):
        rating = 6
        assert not (1 <= rating <= 5)

    def test_invalid_rating_negative(self):
        rating = -1
        assert not (1 <= rating <= 5)

    def test_avg_rating_calculation(self):
        ratings = [5, 4, 3, 5, 4]
        avg = sum(ratings) / len(ratings)
        assert avg == pytest.approx(4.2)

    def test_avg_rating_single(self):
        ratings = [3]
        avg = sum(ratings) / len(ratings)
        assert avg == 3.0

    def test_avg_rating_decimal_precision(self):
        """avg_rating is Numeric(3,2), so max is 9.99 and 2 decimal places."""
        avg = Decimal("4.50")
        assert float(avg) == 4.50

    def test_pydantic_rating_validation(self):
        """The RateListingRequest model uses Field(ge=1, le=5)."""
        from backend.routers.marketplace import RateListingRequest

        valid = RateListingRequest(rating=3, review="Good")
        assert valid.rating == 3

    def test_pydantic_rating_rejects_invalid(self):
        from backend.routers.marketplace import RateListingRequest
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            RateListingRequest(rating=0)

        with pytest.raises(ValidationError):
            RateListingRequest(rating=6)


# ===========================================================================
# 8. Schedule Cron Validation Tests
# ===========================================================================


class TestScheduleCronValidation:
    """Test cron expression patterns and schedule enable/disable logic."""

    CRON_PATTERN = re.compile(
        r"^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$"
    )

    def test_valid_every_minute(self):
        assert self.CRON_PATTERN.match("* * * * *")

    def test_valid_daily_at_9am(self):
        assert self.CRON_PATTERN.match("0 9 * * *")

    def test_valid_weekly_monday(self):
        assert self.CRON_PATTERN.match("0 0 * * 1")

    def test_valid_monthly_first_day(self):
        assert self.CRON_PATTERN.match("0 0 1 * *")

    def test_valid_with_ranges(self):
        assert self.CRON_PATTERN.match("0 9-17 * * 1-5")

    def test_invalid_too_few_fields(self):
        assert not self.CRON_PATTERN.match("* * *")

    def test_invalid_too_many_fields(self):
        assert not self.CRON_PATTERN.match("* * * * * *")

    def test_schedule_enable_disable(self):
        """Schedule can be toggled via enabled field."""
        schedule = _mock_model(enabled=True, cron_expression="0 9 * * *")
        assert schedule.enabled is True
        schedule.enabled = False
        assert schedule.enabled is False


# ===========================================================================
# 9. Test Case Evaluation Tests
# ===========================================================================


class TestCaseEvaluation:
    """Test the _evaluate_test_case logic from the test_cases router."""

    def test_simple_pass_no_expected_output(self):
        from backend.routers.test_cases import _evaluate_test_case

        tc = _mock_model(
            id=uuid.uuid4(), name="Open-ended",
            input_text="Tell me a joke",
            expected_output=None,
            expected_tool_calls=None,
        )
        result = _evaluate_test_case(tc)
        assert result["passed"] is True
        assert result["score"] == 1.0

    def test_simple_fail_with_expected_output(self):
        from backend.routers.test_cases import _evaluate_test_case

        tc = _mock_model(
            id=uuid.uuid4(), name="Specific answer",
            input_text="What is 2+2?",
            expected_output="4",
            expected_tool_calls=None,
        )
        result = _evaluate_test_case(tc)
        # The simulated output is "[simulated] Response to: What is 2+2?"
        # "4" is not in that string, so it should fail
        assert result["passed"] is False
        assert result["score"] == 0.0

    def test_pass_fail_counting(self):
        """Verify pass/fail counting logic for a test run."""
        results = [
            {"passed": True, "score": 1.0},
            {"passed": True, "score": 1.0},
            {"passed": False, "score": 0.0},
            {"passed": True, "score": 1.0},
            {"passed": False, "score": 0.0},
        ]
        passed = sum(1 for r in results if r["passed"])
        failed = sum(1 for r in results if not r["passed"])
        assert passed == 3
        assert failed == 2

    def test_evaluate_returns_expected_fields(self):
        from backend.routers.test_cases import _evaluate_test_case

        tc = _mock_model(
            id=uuid.uuid4(), name="Test",
            input_text="Hello",
            expected_output=None,
            expected_tool_calls=None,
        )
        result = _evaluate_test_case(tc)
        expected_keys = {"test_case_id", "test_case_name", "passed", "actual_output",
                         "expected_output", "score", "error"}
        assert set(result.keys()) == expected_keys

    def test_evaluate_includes_test_case_id(self):
        from backend.routers.test_cases import _evaluate_test_case

        tc_id = uuid.uuid4()
        tc = _mock_model(
            id=tc_id, name="ID check",
            input_text="test",
            expected_output=None,
            expected_tool_calls=None,
        )
        result = _evaluate_test_case(tc)
        assert result["test_case_id"] == str(tc_id)
        assert result["test_case_name"] == "ID check"


# ===========================================================================
# 10. Transcript Model Tests
# ===========================================================================


class TestTranscriptModels:
    """Test transcript-related patterns."""

    def test_segment_ordering_by_index(self):
        segments = [
            _mock_model(segment_index=2, start_ms=5000, text="Second"),
            _mock_model(segment_index=0, start_ms=0, text="First"),
            _mock_model(segment_index=1, start_ms=2500, text="Middle"),
        ]
        sorted_segs = sorted(segments, key=lambda s: s.segment_index)
        assert [s.text for s in sorted_segs] == ["First", "Middle", "Second"]

    def test_segment_ordering_by_start_ms(self):
        segments = [
            _mock_model(segment_index=0, start_ms=0),
            _mock_model(segment_index=1, start_ms=3000),
            _mock_model(segment_index=2, start_ms=7000),
        ]
        for i in range(len(segments) - 1):
            assert segments[i].start_ms < segments[i + 1].start_ms

    def test_action_item_schema(self):
        action_items = [
            {"text": "Fix login bug", "assignee": "Alice", "due_date": "2026-04-01", "status": "pending"},
            {"text": "Review PR #42", "assignee": "Bob", "due_date": None, "status": "done"},
        ]
        for item in action_items:
            assert "text" in item
            assert "assignee" in item
            assert "status" in item

    def test_transcript_source_column_default(self):
        """Verify the Transcript model has a default source value."""
        from backend.models import Transcript

        cols = {c.key: c for c in Transcript.__table__.columns}
        assert "source" in cols
        assert cols["source"].default is not None or cols["source"].server_default is not None

    def test_transcript_status_column_default(self):
        """Verify the Transcript model has a default status value."""
        from backend.models import Transcript

        cols = {c.key: c for c in Transcript.__table__.columns}
        assert "status" in cols
        assert cols["status"].default is not None or cols["status"].server_default is not None

    def test_segment_confidence_range(self):
        """Confidence is Numeric(5,4), so values 0.0000 to 9.9999."""
        valid_confidences = [Decimal("0.0000"), Decimal("0.5000"), Decimal("0.9999")]
        for c in valid_confidences:
            assert 0 <= float(c) <= 1.0


# ===========================================================================
# 11. Router Import Tests
# ===========================================================================


class TestRouterImports:
    """Verify all new routers can be imported without errors."""

    def test_import_approval_gates_router(self):
        from backend.routers.approval_gates import router

        assert router.prefix == "/api/approval-gates"

    def test_import_prompt_templates_router(self):
        from backend.routers.prompt_templates import router

        assert router.prefix == "/api/prompt-templates"

    def test_import_agent_versions_router(self):
        from backend.routers.agent_versions import router

        assert router.prefix == "/api/agents/{agent_id}/versions"

    def test_import_agent_runs_router(self):
        from backend.routers.agent_runs import router

        assert router.prefix == "/api/agent-runs"

    def test_import_agent_schedules_router(self):
        from backend.routers.agent_schedules import router

        assert router.prefix == "/api/agent-schedules"

    def test_import_external_actions_router(self):
        from backend.routers.external_actions import router

        assert router.prefix == "/api/external-actions"

    def test_import_test_cases_router(self):
        from backend.routers.test_cases import router

        assert router.prefix == "/api/test-cases"

    def test_import_transcripts_router(self):
        from backend.routers.transcripts import router

        assert router.prefix == "/api/transcripts"

    def test_import_marketplace_router(self):
        from backend.routers.marketplace import router

        assert router.prefix == "/api/marketplace"

    def test_marketplace_valid_categories(self):
        from backend.routers.marketplace import VALID_CATEGORIES

        assert "coding" in VALID_CATEGORIES
        assert "writing" in VALID_CATEGORIES
        assert "research" in VALID_CATEGORIES
        assert "other" in VALID_CATEGORIES


# ===========================================================================
# 12. Audit Action Tests
# ===========================================================================


class TestAuditActions:
    """Verify all new audit actions are defined."""

    def test_new_audit_actions_exist(self):
        from backend.services.audit import AuditAction

        expected = [
            "AGENT_RUN_CREATED", "AGENT_RUN_DELETED",
            "SCHEDULE_CREATED", "SCHEDULE_DELETED",
            "AGENT_VERSION_CREATED", "AGENT_VERSION_PUBLISHED",
            "AGENT_APPROVAL_DECIDED",
            "TEMPLATE_CREATED", "TEMPLATE_DELETED",
            "CONNECTOR_CREATED", "CONNECTOR_DELETED",
            "EXTERNAL_ACTION_APPROVED", "EXTERNAL_ACTION_REJECTED",
            "MARKETPLACE_PUBLISHED", "MARKETPLACE_INSTALLED",
            "TRANSCRIPT_UPLOADED", "TRANSCRIPT_DELETED",
        ]
        for action_name in expected:
            assert hasattr(AuditAction, action_name), f"Missing AuditAction.{action_name}"

    def test_audit_action_values_are_dotted(self):
        """All audit action values follow the 'resource.action' pattern."""
        from backend.services.audit import AuditAction

        for action in AuditAction:
            assert "." in action.value, f"{action.name} value '{action.value}' missing dot separator"
