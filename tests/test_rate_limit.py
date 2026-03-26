"""Tests for backend.rate_limit — RateLimiter in-memory rate limiting.

Covers: requests within limit, 429 when exceeded, window expiry pruning,
and per-user isolation.
"""

import os
import time
import unittest
from unittest.mock import patch

os.environ.setdefault("LITE_LLM_API_KEY", "test-key")
os.environ.setdefault("LITE_LLM_URL", "https://example.com")
os.environ.setdefault("SERVER_SECRET", "test-secret-with-sufficient-length-123456")

from fastapi import HTTPException

from backend.rate_limit import RateLimiter


class TestRateLimiter(unittest.TestCase):
    """Tests for the in-memory per-user RateLimiter."""

    def setUp(self):
        self.limiter = RateLimiter()

    def test_allows_requests_within_limit(self):
        """Requests under the limit should pass without error."""
        for _ in range(5):
            self.limiter.check("user-1", limit=5, window_seconds=60)
        # Should not raise

    def test_raises_429_when_limit_exceeded(self):
        """The (limit+1)th request in the window should raise 429."""
        for _ in range(3):
            self.limiter.check("user-1", limit=3, window_seconds=60)

        with self.assertRaises(HTTPException) as ctx:
            self.limiter.check("user-1", limit=3, window_seconds=60)

        self.assertEqual(ctx.exception.status_code, 429)
        self.assertIn("too quickly", ctx.exception.detail)
        self.assertEqual(ctx.exception.headers["Retry-After"], "60")

    def test_prunes_old_entries_after_window_expires(self):
        """Old timestamps outside the window should be pruned, allowing new requests."""
        # Fill the limiter
        for _ in range(3):
            self.limiter.check("user-1", limit=3, window_seconds=1)

        # Manually age all entries past the window
        self.limiter._requests["user-1"] = [
            time.monotonic() - 10 for _ in range(3)
        ]

        # Should succeed after pruning
        self.limiter.check("user-1", limit=3, window_seconds=1)

    def test_per_user_isolation(self):
        """User A's requests should not affect user B's limit."""
        for _ in range(5):
            self.limiter.check("user-a", limit=5, window_seconds=60)

        # user-a is at limit
        with self.assertRaises(HTTPException):
            self.limiter.check("user-a", limit=5, window_seconds=60)

        # user-b should be unaffected
        self.limiter.check("user-b", limit=5, window_seconds=60)

    def test_exact_limit_boundary(self):
        """Exactly 'limit' requests should be allowed, limit+1 should fail."""
        limit = 10
        for i in range(limit):
            self.limiter.check("user-1", limit=limit, window_seconds=60)

        with self.assertRaises(HTTPException) as ctx:
            self.limiter.check("user-1", limit=limit, window_seconds=60)
        self.assertEqual(ctx.exception.status_code, 429)

    def test_fresh_limiter_has_no_entries(self):
        """A new RateLimiter should have no stored requests."""
        self.assertEqual(len(self.limiter._requests), 0)

    def test_different_windows_are_independent(self):
        """Using different window sizes should still respect the limit."""
        # Fill with a 60s window
        for _ in range(3):
            self.limiter.check("user-1", limit=3, window_seconds=60)

        # Same limit but with a very short window — old entries should be pruned
        self.limiter._requests["user-1"] = [
            time.monotonic() - 2 for _ in range(3)
        ]
        # 1-second window should prune all 3 entries (2s old)
        self.limiter.check("user-1", limit=3, window_seconds=1)


if __name__ == "__main__":
    unittest.main()
