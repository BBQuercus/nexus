import json
import uuid
from types import SimpleNamespace

import pytest

from backend.models import Conversation
from backend.services.agent.history import detect_knowledge
from backend.services.agent.tool_executor import ToolExecutionContext, _knowledge_search


class _FakeVectorSession:
    def __init__(self):
        self.added = []
        self.flushed = False
        self.committed = False

    def add(self, item):
        self.added.append(item)

    async def flush(self):
        self.flushed = True

    async def commit(self):
        self.committed = True


class _FakeVectorContextManager:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, exc_type, exc, tb):
        return False


@pytest.mark.asyncio
async def test_detect_knowledge_only_uses_explicit_conversation_selection():
    selected_kb = uuid.uuid4()
    persona_kb = uuid.uuid4()
    conversation = Conversation(
        user_id=uuid.uuid4(),
        knowledge_base_ids=[str(selected_kb), str(selected_kb)],
    )
    persona = SimpleNamespace(knowledge_base_ids=[str(persona_kb)])

    has_knowledge, knowledge_base_ids = await detect_knowledge(
        db=None,
        conversation=conversation,
        conversation_id=uuid.uuid4(),
        persona=persona,
    )

    assert has_knowledge is True
    assert knowledge_base_ids == [selected_kb]


@pytest.mark.asyncio
async def test_detect_knowledge_is_false_without_explicit_selection():
    conversation = Conversation(user_id=uuid.uuid4(), knowledge_base_ids=None)
    persona = SimpleNamespace(knowledge_base_ids=[str(uuid.uuid4())])

    has_knowledge, knowledge_base_ids = await detect_knowledge(
        db=None,
        conversation=conversation,
        conversation_id=uuid.uuid4(),
        persona=persona,
    )

    assert has_knowledge is False
    assert knowledge_base_ids == []


@pytest.mark.asyncio
async def test_knowledge_search_rejects_unselected_knowledge_base_ids(monkeypatch):
    allowed_kb = uuid.uuid4()
    requested_kb = uuid.uuid4()
    called = False

    async def fake_run_knowledge_search(*args, **kwargs):
        nonlocal called
        called = True
        raise AssertionError("retrieval should not run when no requested KB is selected")

    monkeypatch.setattr("backend.services.agent.tool_executor._run_knowledge_search", fake_run_knowledge_search)

    ctx = ToolExecutionContext(
        conversation=SimpleNamespace(user_id=uuid.uuid4(), sandbox_template=None),
        conversation_id=uuid.uuid4(),
        db=None,
        knowledge_base_ids=[allowed_kb],
        has_knowledge=True,
        user_message="What does the document say?",
    )

    events = [
        event
        async for event in _knowledge_search(
            "knowledge_search",
            {"query": "pricing", "knowledge_base_ids": [str(requested_kb)]},
            "tool-call-1",
            ctx,
        )
    ]

    assert called is False
    assert len(events) == 2
    assert events[0]["event"] == "tool_output"
    payload = json.loads(events[0]["data"])
    assert payload["tool"] == "knowledge_search"
    assert "No selected knowledge base is available for this search" in payload["output"]
    assert events[1]["__set_output__"] is True


@pytest.mark.asyncio
async def test_knowledge_search_scopes_requests_to_selected_knowledge_bases(monkeypatch):
    allowed_kb = uuid.uuid4()
    blocked_kb = uuid.uuid4()
    captured = {}
    fake_result = SimpleNamespace(
        query="pricing",
        confidence=0.91,
        chunks=[],
        total_candidates=0,
        retrieval_time_ms=12,
        rerank_time_ms=3,
    )
    fake_vector_session = _FakeVectorSession()

    async def fake_run_knowledge_search(query, kb_ids, conversation_id):
        captured["query"] = query
        captured["kb_ids"] = kb_ids
        captured["conversation_id"] = conversation_id
        return fake_result

    monkeypatch.setattr("backend.services.agent.tool_executor._run_knowledge_search", fake_run_knowledge_search)
    monkeypatch.setattr(
        "backend.services.agent.tool_executor.vector_async_session",
        lambda: _FakeVectorContextManager(fake_vector_session),
    )
    monkeypatch.setattr("backend.services.rag.citations.format_retrieval_context", lambda result: ("Scoped context", 0.91))
    monkeypatch.setattr(
        "backend.services.rag.citations.build_retrieval_sse_event",
        lambda result: {"query": result.query, "confidence": result.confidence, "sources": []},
    )
    monkeypatch.setattr("backend.services.rag.citations.build_citations_json", lambda result: [{"source": "kb"}])

    ctx = ToolExecutionContext(
        conversation=SimpleNamespace(user_id=uuid.uuid4(), sandbox_template=None),
        conversation_id=uuid.uuid4(),
        db=None,
        knowledge_base_ids=[allowed_kb],
        has_knowledge=True,
        user_message="What does the selected KB say?",
    )

    events = [
        event
        async for event in _knowledge_search(
            "knowledge_search",
            {"query": "pricing", "knowledge_base_ids": [str(blocked_kb), str(allowed_kb)]},
            "tool-call-2",
            ctx,
        )
    ]

    assert captured["query"] == "pricing"
    assert captured["kb_ids"] == [allowed_kb]
    assert captured["conversation_id"] == ctx.conversation_id
    assert fake_vector_session.flushed is True
    assert fake_vector_session.committed is True
    assert len(fake_vector_session.added) == 1
    assert ctx.rag_citations == [{"source": "kb"}]
    assert events[0]["event"] == "retrieval_results"
    retrieval_payload = json.loads(events[0]["data"])
    assert retrieval_payload["query"] == "pricing"
    assert events[1]["event"] == "tool_output"
    tool_payload = json.loads(events[1]["data"])
    assert tool_payload["output"] == "Scoped context"
    assert events[2]["__set_output__"] is True
