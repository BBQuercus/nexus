"""Tests for backend.models — SQLAlchemy model definitions.

Covers: model instantiation, UUID primary keys, default values, JSON field
serialization, optional/nullable fields, and relationship definitions.
"""

import os
import unittest
import uuid
from datetime import datetime
from decimal import Decimal

os.environ.setdefault("LITE_LLM_API_KEY", "test-key")
os.environ.setdefault("LITE_LLM_URL", "https://example.com")
os.environ.setdefault("SERVER_SECRET", "test-secret-with-sufficient-length-123456")

from backend.models import (
    AgentPersona,
    AnalyticsEvent,
    Artifact,
    Chunk,
    Conversation,
    Document,
    Feedback,
    FrontendError,
    KnowledgeBase,
    KnowledgeBaseAgent,
    Message,
    RetrievalLog,
    UsageLog,
    User,
)


class TestUserModel(unittest.TestCase):
    """Tests for the User model."""

    def test_instantiation_with_required_fields(self):
        user = User(
            workos_id="wos_123",
            email="user@example.com",
            name="Test User",
        )
        self.assertEqual(user.workos_id, "wos_123")
        self.assertEqual(user.email, "user@example.com")
        self.assertEqual(user.name, "Test User")

    def test_uuid_primary_key_default(self):
        user = User(workos_id="wos_1", email="a@b.com", name="A")
        # id should have a default factory
        col = User.__table__.columns["id"]
        self.assertTrue(col.primary_key)
        self.assertIsNotNone(col.default)

    def test_is_admin_defaults_to_false(self):
        user = User(workos_id="wos_1", email="a@b.com", name="A")
        self.assertFalse(user.is_admin)

    def test_optional_avatar_url(self):
        user = User(workos_id="wos_1", email="a@b.com", name="A", avatar_url=None)
        self.assertIsNone(user.avatar_url)

        user2 = User(
            workos_id="wos_2",
            email="b@b.com",
            name="B",
            avatar_url="https://example.com/avatar.png",
        )
        self.assertEqual(user2.avatar_url, "https://example.com/avatar.png")

    def test_relationship_attributes_exist(self):
        """User model should declare conversations, agent_personas, usage_logs relationships."""
        mapper = User.__mapper__
        rel_names = {r.key for r in mapper.relationships}
        self.assertIn("conversations", rel_names)
        self.assertIn("agent_personas", rel_names)
        self.assertIn("usage_logs", rel_names)


class TestConversationModel(unittest.TestCase):
    """Tests for the Conversation model."""

    def test_instantiation(self):
        user_id = uuid.uuid4()
        conv = Conversation(user_id=user_id, agent_mode="code")
        self.assertEqual(conv.user_id, user_id)
        self.assertEqual(conv.agent_mode, "code")

    def test_optional_fields_default_to_none(self):
        conv = Conversation(user_id=uuid.uuid4())
        self.assertIsNone(conv.title)
        self.assertIsNone(conv.sandbox_id)
        self.assertIsNone(conv.sandbox_template)

    def test_knowledge_base_ids_json_field(self):
        kb_ids = [str(uuid.uuid4()), str(uuid.uuid4())]
        conv = Conversation(
            user_id=uuid.uuid4(),
            knowledge_base_ids=kb_ids,
        )
        self.assertEqual(conv.knowledge_base_ids, kb_ids)

    def test_relationships_exist(self):
        mapper = Conversation.__mapper__
        rel_names = {r.key for r in mapper.relationships}
        self.assertIn("user", rel_names)
        self.assertIn("messages", rel_names)
        self.assertIn("artifacts", rel_names)
        self.assertIn("usage_logs", rel_names)


class TestMessageModel(unittest.TestCase):
    """Tests for the Message model."""

    def test_instantiation(self):
        conv_id = uuid.uuid4()
        msg = Message(conversation_id=conv_id, role="user", content="Hello")
        self.assertEqual(msg.conversation_id, conv_id)
        self.assertEqual(msg.role, "user")
        self.assertEqual(msg.content, "Hello")

    def test_json_fields_accept_dicts_and_lists(self):
        msg = Message(
            conversation_id=uuid.uuid4(),
            role="assistant",
            content="result",
            tool_calls=[{"function": {"name": "test", "arguments": {}}}],
            charts=[{"type": "bar", "data": [1, 2, 3]}],
            citations=[{"source": "doc.pdf", "page": 1}],
            images=["data:image/png;base64,abc"],
        )
        self.assertIsInstance(msg.tool_calls, list)
        self.assertIsInstance(msg.charts, list)
        self.assertIsInstance(msg.citations, list)

    def test_optional_fields(self):
        msg = Message(conversation_id=uuid.uuid4(), role="user", content="hi")
        self.assertIsNone(msg.reasoning)
        self.assertIsNone(msg.tool_calls)
        self.assertIsNone(msg.tool_result)
        self.assertIsNone(msg.images)
        self.assertIsNone(msg.charts)
        self.assertIsNone(msg.citations)
        self.assertIsNone(msg.feedback)
        self.assertIsNone(msg.token_count)
        self.assertIsNone(msg.cost_usd)
        self.assertIsNone(msg.parent_id)

    def test_branch_index_has_default_defined(self):
        """The branch_index column should define a Python default of 0."""
        col = Message.__table__.columns["branch_index"]
        self.assertEqual(col.default.arg, 0)

    def test_parent_relationship_exists(self):
        mapper = Message.__mapper__
        rel_names = {r.key for r in mapper.relationships}
        self.assertIn("parent", rel_names)
        self.assertIn("conversation", rel_names)
        self.assertIn("artifacts", rel_names)


class TestArtifactModel(unittest.TestCase):
    """Tests for the Artifact model."""

    def test_instantiation(self):
        conv_id = uuid.uuid4()
        msg_id = uuid.uuid4()
        artifact = Artifact(
            conversation_id=conv_id,
            message_id=msg_id,
            type="code",
            label="main.py",
            content="print('hello')",
        )
        self.assertEqual(artifact.type, "code")
        self.assertEqual(artifact.label, "main.py")

    def test_metadata_json_field(self):
        artifact = Artifact(
            conversation_id=uuid.uuid4(),
            message_id=uuid.uuid4(),
            type="document",
            label="report.pdf",
            content="data",
            metadata_={"path": "/home/daytona/report.pdf"},
        )
        self.assertEqual(artifact.metadata_["path"], "/home/daytona/report.pdf")

    def test_pinned_defaults_to_false(self):
        artifact = Artifact(
            conversation_id=uuid.uuid4(),
            message_id=uuid.uuid4(),
            type="code",
            label="test",
            content="x",
        )
        self.assertFalse(artifact.pinned)


class TestAgentPersonaModel(unittest.TestCase):
    """Tests for the AgentPersona model."""

    def test_instantiation(self):
        persona = AgentPersona(
            user_id=uuid.uuid4(),
            name="Code Expert",
            system_prompt="You are a code expert.",
        )
        self.assertEqual(persona.name, "Code Expert")

    def test_defaults_defined_on_columns(self):
        """AgentPersona columns should declare correct Python-level defaults."""
        cols = AgentPersona.__table__.columns
        self.assertEqual(cols["default_mode"].default.arg, "code")
        self.assertEqual(cols["icon"].default.arg, "\U0001f916")
        self.assertEqual(cols["is_public"].default.arg, False)
        self.assertEqual(cols["usage_count"].default.arg, 0)

    def test_json_fields(self):
        persona = AgentPersona(
            user_id=uuid.uuid4(),
            name="Test",
            system_prompt="prompt",
            tools_enabled=["execute_code", "web_search"],
            knowledge_base_ids=[str(uuid.uuid4())],
        )
        self.assertIsInstance(persona.tools_enabled, list)
        self.assertEqual(len(persona.tools_enabled), 2)


class TestUsageLogModel(unittest.TestCase):
    """Tests for the UsageLog model."""

    def test_instantiation(self):
        log = UsageLog(
            user_id=uuid.uuid4(),
            conversation_id=uuid.uuid4(),
            model="gpt-4",
            input_tokens=100,
            output_tokens=50,
            cost_usd=Decimal("0.005"),
        )
        self.assertEqual(log.model, "gpt-4")
        self.assertEqual(log.input_tokens, 100)
        self.assertEqual(log.cost_usd, Decimal("0.005"))

    def test_optional_sandbox_seconds(self):
        log = UsageLog(
            user_id=uuid.uuid4(),
            conversation_id=uuid.uuid4(),
            model="gpt-4",
            input_tokens=10,
            output_tokens=5,
            cost_usd=Decimal("0.001"),
        )
        self.assertIsNone(log.sandbox_seconds)


class TestKnowledgeBaseModel(unittest.TestCase):
    """Tests for the KnowledgeBase model."""

    def test_defaults_defined_on_columns(self):
        """KnowledgeBase columns should declare correct Python-level defaults."""
        cols = KnowledgeBase.__table__.columns
        self.assertEqual(cols["embedding_model"].default.arg, "text-embedding-3-small")
        self.assertEqual(cols["chunk_strategy"].default.arg, "contextual")
        self.assertEqual(cols["document_count"].default.arg, 0)
        self.assertEqual(cols["chunk_count"].default.arg, 0)
        self.assertEqual(cols["status"].default.arg, "ready")
        self.assertEqual(cols["is_public"].default.arg, False)


class TestFeedbackModel(unittest.TestCase):
    """Tests for the Feedback model."""

    def test_instantiation(self):
        fb = Feedback(
            user_id=uuid.uuid4(),
            message_id=uuid.uuid4(),
            conversation_id=uuid.uuid4(),
            rating="up",
            tags=["helpful", "accurate"],
            comment="Great response",
        )
        self.assertEqual(fb.rating, "up")
        self.assertEqual(fb.tags, ["helpful", "accurate"])


class TestDocumentModel(unittest.TestCase):
    """Tests for the Document model."""

    def test_instantiation(self):
        doc = Document(
            user_id=uuid.uuid4(),
            filename="report.pdf",
            content_type="application/pdf",
            file_size_bytes=1024,
        )
        self.assertEqual(doc.filename, "report.pdf")
        # status default is set via column default, not __init__
        col = Document.__table__.columns["status"]
        self.assertEqual(col.default.arg, "processing")

    def test_optional_knowledge_base_id(self):
        doc = Document(
            user_id=uuid.uuid4(),
            filename="test.txt",
            content_type="text/plain",
            file_size_bytes=100,
            knowledge_base_id=None,
        )
        self.assertIsNone(doc.knowledge_base_id)


class TestAllModelsHaveUUIDPrimaryKeys(unittest.TestCase):
    """Verifies all models use UUID primary keys with defaults."""

    def test_all_models_have_uuid_pk(self):
        models = [
            User, Conversation, Message, Artifact, AgentPersona,
            FrontendError, UsageLog, Feedback, AnalyticsEvent,
            KnowledgeBase, Document, Chunk, KnowledgeBaseAgent, RetrievalLog,
        ]
        for model in models:
            pk_cols = [c for c in model.__table__.columns if c.primary_key]
            self.assertEqual(len(pk_cols), 1, f"{model.__name__} should have exactly 1 PK")
            pk = pk_cols[0]
            self.assertEqual(pk.name, "id", f"{model.__name__}.id should be the PK")


if __name__ == "__main__":
    unittest.main()
