"""Tests for multi-org foundation: JWT org_id, org CRUD API, membership, RBAC.

Covers: create_access_token with org_id, get_current_org, generate_csrf_token
with org_id, Organization/UserOrg models, org router endpoints, role checks.
"""

import os
import unittest
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("LITE_LLM_API_KEY", "test-key")
os.environ.setdefault("LITE_LLM_URL", "https://example.com")
os.environ.setdefault("SERVER_SECRET", "test-secret-with-sufficient-length-123456")

import jwt
from starlette.requests import Request

from backend.auth import (
    create_access_token,
    create_refresh_token,
    generate_csrf_token,
)
from backend.config import settings
from backend.services.rbac import Role, has_permission, ROLE_PERMISSIONS


def _make_request(
    method: str = "POST",
    headers: dict[str, str] | None = None,
    cookies: dict[str, str] | None = None,
    path: str = "/",
) -> Request:
    raw_headers = []
    for key, value in (headers or {}).items():
        raw_headers.append((key.lower().encode("latin-1"), value.encode("latin-1")))
    if cookies:
        cookie_str = "; ".join(f"{k}={v}" for k, v in cookies.items())
        raw_headers.append((b"cookie", cookie_str.encode("latin-1")))
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": raw_headers,
        "client": ("127.0.0.1", 1234),
        "server": ("testserver", 80),
        "scheme": "http",
    }
    return Request(scope)


class TestAccessTokenWithOrgId(unittest.TestCase):
    """Test that create_access_token includes org_id when provided."""

    def test_access_token_includes_org_id(self):
        user_id = str(uuid.uuid4())
        org_id = str(uuid.uuid4())
        token = create_access_token(user_id, "user@example.com", org_id=org_id)
        payload = jwt.decode(token, settings.SERVER_SECRET, algorithms=[settings.JWT_ENCODING_ALGORITHM])
        self.assertEqual(payload["org_id"], org_id)
        self.assertEqual(payload["sub"], user_id)
        self.assertEqual(payload["type"], "access")

    def test_access_token_without_org_id(self):
        user_id = str(uuid.uuid4())
        token = create_access_token(user_id, "user@example.com")
        payload = jwt.decode(token, settings.SERVER_SECRET, algorithms=[settings.JWT_ENCODING_ALGORITHM])
        self.assertNotIn("org_id", payload)

    def test_refresh_token_never_has_org_id(self):
        user_id = str(uuid.uuid4())
        token = create_refresh_token(user_id, "user@example.com")
        payload = jwt.decode(token, settings.SERVER_SECRET, algorithms=[settings.JWT_ENCODING_ALGORITHM])
        self.assertNotIn("org_id", payload)
        self.assertEqual(payload["type"], "refresh")


class TestCsrfTokenWithOrgId(unittest.TestCase):
    """Test that CSRF token generation includes org_id."""

    def test_csrf_token_changes_with_org_id(self):
        csrf_no_org = generate_csrf_token("user123", "1234")
        csrf_with_org = generate_csrf_token("user123", "1234", "org-abc")
        self.assertNotEqual(csrf_no_org, csrf_with_org)

    def test_csrf_token_different_orgs_produce_different_tokens(self):
        csrf_org_a = generate_csrf_token("user123", "1234", "org-a")
        csrf_org_b = generate_csrf_token("user123", "1234", "org-b")
        self.assertNotEqual(csrf_org_a, csrf_org_b)

    def test_csrf_token_same_inputs_produce_same_token(self):
        csrf1 = generate_csrf_token("user123", "1234", "org-a")
        csrf2 = generate_csrf_token("user123", "1234", "org-a")
        self.assertEqual(csrf1, csrf2)


class TestGetCurrentOrg(unittest.IsolatedAsyncioTestCase):
    """Test get_current_org dependency."""

    async def test_extracts_org_id_from_jwt(self):
        from backend.auth import get_current_org

        user_id = str(uuid.uuid4())
        org_id = str(uuid.uuid4())
        token = create_access_token(user_id, "user@example.com", org_id=org_id)
        request = _make_request(cookies={"session": token})
        result = await get_current_org(request)
        self.assertEqual(result, uuid.UUID(org_id))

    async def test_raises_401_when_no_org_id_in_token(self):
        from backend.auth import get_current_org
        from fastapi import HTTPException

        user_id = str(uuid.uuid4())
        token = create_access_token(user_id, "user@example.com")  # no org_id
        request = _make_request(cookies={"session": token})
        with self.assertRaises(HTTPException) as ctx:
            await get_current_org(request)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("organization", ctx.exception.detail.lower())

    async def test_raises_401_when_no_session(self):
        from backend.auth import get_current_org
        from fastapi import HTTPException

        request = _make_request()
        with self.assertRaises(HTTPException) as ctx:
            await get_current_org(request)
        self.assertEqual(ctx.exception.status_code, 401)


class TestRBACRoles(unittest.TestCase):
    """Test the updated RBAC role hierarchy."""

    def test_owner_role_exists(self):
        self.assertIn(Role.OWNER, ROLE_PERMISSIONS)

    def test_owner_has_all_admin_permissions(self):
        admin_perms = ROLE_PERMISSIONS[Role.ADMIN]
        owner_perms = ROLE_PERMISSIONS[Role.OWNER]
        self.assertTrue(admin_perms.issubset(owner_perms))

    def test_admin_has_all_editor_permissions(self):
        editor_perms = ROLE_PERMISSIONS[Role.EDITOR]
        admin_perms = ROLE_PERMISSIONS[Role.ADMIN]
        self.assertTrue(editor_perms.issubset(admin_perms))

    def test_viewer_cannot_create(self):
        self.assertFalse(has_permission(Role.VIEWER, "conversation.create"))

    def test_editor_can_create(self):
        self.assertTrue(has_permission(Role.EDITOR, "conversation.create"))

    def test_admin_has_org_permissions(self):
        self.assertTrue(has_permission(Role.ADMIN, "org.members.read"))
        self.assertTrue(has_permission(Role.ADMIN, "org.settings.update"))

    def test_only_owner_can_delete_org(self):
        self.assertTrue(has_permission(Role.OWNER, "org.delete"))
        self.assertFalse(has_permission(Role.ADMIN, "org.delete"))
        self.assertFalse(has_permission(Role.EDITOR, "org.delete"))


class TestOrganizationModel(unittest.TestCase):
    """Test the Organization and UserOrg SQLAlchemy models."""

    def test_organization_model_exists(self):
        from backend.models import Organization
        self.assertEqual(Organization.__tablename__, "organizations")

    def test_user_org_model_exists(self):
        from backend.models import UserOrg
        self.assertEqual(UserOrg.__tablename__, "user_orgs")

    def test_user_has_memberships_relationship(self):
        from backend.models import User
        self.assertIn("memberships", User.__mapper__.relationships.keys())

    def test_user_has_is_superadmin(self):
        from backend.models import User
        self.assertIn("is_superadmin", User.__table__.columns.keys())

    def test_user_no_longer_has_is_admin(self):
        from backend.models import User
        self.assertNotIn("is_admin", User.__table__.columns.keys())

    def test_user_no_longer_has_role(self):
        from backend.models import User
        self.assertNotIn("role", User.__table__.columns.keys())

    def test_conversation_has_org_id(self):
        from backend.models import Conversation
        self.assertIn("org_id", Conversation.__table__.columns.keys())

    def test_message_has_org_id(self):
        from backend.models import Message
        self.assertIn("org_id", Message.__table__.columns.keys())

    def test_project_has_org_id(self):
        from backend.models import Project
        self.assertIn("org_id", Project.__table__.columns.keys())

    def test_agent_persona_has_org_id(self):
        from backend.models import AgentPersona
        self.assertIn("org_id", AgentPersona.__table__.columns.keys())

    def test_knowledge_base_has_org_id(self):
        from backend.models import KnowledgeBase
        self.assertIn("org_id", KnowledgeBase.__table__.columns.keys())

    def test_usage_log_has_org_id(self):
        from backend.models import UsageLog
        self.assertIn("org_id", UsageLog.__table__.columns.keys())

    def test_feedback_has_org_id(self):
        from backend.models import Feedback
        self.assertIn("org_id", Feedback.__table__.columns.keys())

    def test_audit_event_has_org_id(self):
        from backend.models import AuditEventLog
        self.assertIn("org_id", AuditEventLog.__table__.columns.keys())

    def test_memory_has_org_id(self):
        from backend.models import Memory
        self.assertIn("org_id", Memory.__table__.columns.keys())

    def test_artifact_has_org_id(self):
        from backend.models import Artifact
        self.assertIn("org_id", Artifact.__table__.columns.keys())

    def test_document_has_org_id(self):
        from backend.models import Document
        self.assertIn("org_id", Document.__table__.columns.keys())

    def test_chunk_has_org_id(self):
        from backend.models import Chunk
        self.assertIn("org_id", Chunk.__table__.columns.keys())


class TestAuditServiceOrgId(unittest.TestCase):
    """Test that audit service accepts org_id parameter."""

    def test_audit_event_model_has_org_id(self):
        from backend.services.audit import AuditEvent
        event = AuditEvent(
            id="test",
            timestamp=datetime.now(timezone.utc),
            action="user.login",
            org_id="test-org-id",
        )
        self.assertEqual(event.org_id, "test-org-id")

    def test_audit_actions_include_org_events(self):
        from backend.services.audit import AuditAction
        self.assertIn("org.created", [a.value for a in AuditAction])
        self.assertIn("org.member_invited", [a.value for a in AuditAction])
        self.assertIn("org.switched", [a.value for a in AuditAction])


if __name__ == "__main__":
    unittest.main()
