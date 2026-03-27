import uuid
from types import SimpleNamespace

import pytest

from backend.services.memory import extract_memories_from_message, save_memories_from_message


class _FakeScalarResult:
    def __init__(self, items):
        self._items = items

    def all(self):
        return list(self._items)


class _FakeExecuteResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return _FakeScalarResult(self._items)


class _FakeSession:
    def __init__(self, existing=None):
        self.existing = existing or []
        self.added = []
        self.flush_called = False

    async def execute(self, stmt):
        return _FakeExecuteResult(self.existing)

    def add_all(self, items):
        self.added.extend(items)

    async def flush(self):
        self.flush_called = True


def test_extract_memories_sets_org_id_and_avoids_overlapping_matches():
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    conversation_id = uuid.uuid4()
    message_id = uuid.uuid4()

    memories = extract_memories_from_message(
        org_id=org_id,
        user_id=user_id,
        message_content="Remember that I prefer concise answers, code examples over explanations.",
        conversation_id=conversation_id,
        message_id=message_id,
    )

    assert len(memories) == 1
    assert memories[0].org_id == org_id
    assert memories[0].user_id == user_id
    assert memories[0].source_conversation_id == conversation_id
    assert memories[0].source_message_id == message_id
    assert memories[0].category == "instruction"
    assert memories[0].content == "that I prefer concise answers, code examples over explanations."


@pytest.mark.asyncio
async def test_save_memories_from_message_skips_existing_duplicates():
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    existing = [
        SimpleNamespace(
            category="instruction",
            scope="global",
            content="that I prefer concise answers, code examples over explanations.",
        )
    ]
    db = _FakeSession(existing=existing)

    saved = await save_memories_from_message(
        db,
        org_id=org_id,
        user_id=user_id,
        message_content="Remember that I prefer concise answers, code examples over explanations.",
    )

    assert saved == []
    assert db.added == []
    assert db.flush_called is False


@pytest.mark.asyncio
async def test_save_memories_from_message_persists_new_memory():
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    db = _FakeSession()

    saved = await save_memories_from_message(
        db,
        org_id=org_id,
        user_id=user_id,
        message_content="I prefer concise answers.",
    )

    assert len(saved) == 1
    assert db.added == saved
    assert db.flush_called is True
    assert saved[0].org_id == org_id
    assert saved[0].category == "preference"
    assert saved[0].content == "concise answers."
