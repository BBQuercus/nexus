"""Tests for backend.rate_limit — in-memory fallback rate limiting.

Covers: requests within limit, 429 when exceeded, and per-user isolation
using the async check_rate_limit function with Redis unavailable (in-memory fallback).
"""

import os

os.environ.setdefault("LITE_LLM_API_KEY", "test-key")
os.environ.setdefault("LITE_LLM_URL", "https://example.com")
os.environ.setdefault("SERVER_SECRET", "test-secret-with-sufficient-length-123456")

import pytest
from fastapi import HTTPException

from backend.rate_limit import _memory_requests, check_rate_limit


async def _no_redis():
    return None


@pytest.fixture(autouse=True)
def clear_memory_requests(monkeypatch):
    """Clear in-memory rate limit state between tests and disable Redis."""
    monkeypatch.setattr("backend.redis.get_redis", _no_redis)
    _memory_requests.clear()
    yield
    _memory_requests.clear()


@pytest.mark.asyncio
async def test_allows_requests_within_limit():
    for _ in range(5):
        await check_rate_limit("user-1", limit=5, window_seconds=60, category="test_allow")


@pytest.mark.asyncio
async def test_raises_429_when_limit_exceeded():
    for _ in range(3):
        await check_rate_limit("user-1", limit=3, window_seconds=60, category="test_exceed")

    with pytest.raises(HTTPException) as exc:
        await check_rate_limit("user-1", limit=3, window_seconds=60, category="test_exceed")

    assert exc.value.status_code == 429
    assert "too quickly" in exc.value.detail


@pytest.mark.asyncio
async def test_per_user_isolation():
    for _ in range(3):
        await check_rate_limit("user-a", limit=3, window_seconds=60, category="test_iso")

    with pytest.raises(HTTPException):
        await check_rate_limit("user-a", limit=3, window_seconds=60, category="test_iso")

    # user-b should be unaffected
    await check_rate_limit("user-b", limit=3, window_seconds=60, category="test_iso")
