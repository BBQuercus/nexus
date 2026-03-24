import time
from collections import defaultdict
from fastapi import HTTPException


class RateLimiter:
    """Simple in-memory rate limiter per user."""

    def __init__(self):
        self._requests: dict[str, list[float]] = defaultdict(list)

    def check(self, user_id: str, limit: int, window_seconds: int):
        """Check if user is within rate limit. Raises 429 if exceeded."""
        now = time.monotonic()
        key = f"{user_id}"
        # Prune old entries
        self._requests[key] = [t for t in self._requests[key] if now - t < window_seconds]
        if len(self._requests[key]) >= limit:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Max {limit} requests per {window_seconds}s.",
                headers={"Retry-After": str(window_seconds)},
            )
        self._requests[key].append(now)


# Global instances
chat_limiter = RateLimiter()  # 60 req/min for chat
sandbox_limiter = RateLimiter()  # 10 req/min for sandbox creation
