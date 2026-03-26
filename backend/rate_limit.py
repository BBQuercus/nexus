"""Rate limiting with Redis backend and in-memory fallback.

Uses Redis sorted sets for distributed rate limiting across instances.
Falls back to in-memory when Redis is unavailable.
"""

import time
from collections import defaultdict

from fastapi import HTTPException

from backend.logging_config import get_logger

logger = get_logger("rate_limit")

# In-memory fallback
_memory_requests: dict[str, list[float]] = defaultdict(list)


async def check_rate_limit(
    user_id: str,
    limit: int,
    window_seconds: int,
    category: str = "default",
):
    """Check if user is within rate limit. Raises 429 if exceeded.

    Uses Redis sorted sets for distributed rate limiting.
    Falls back to in-memory if Redis is unavailable.
    """
    from backend.redis import get_redis

    key = f"ratelimit:{category}:{user_id}"
    now = time.time()
    window_start = now - window_seconds

    r = await get_redis()
    if r:
        try:
            pipe = r.pipeline()
            pipe.zremrangebyscore(f"nexus:{key}", 0, window_start)
            pipe.zcard(f"nexus:{key}")
            pipe.zadd(f"nexus:{key}", {str(now): now})
            pipe.expire(f"nexus:{key}", window_seconds + 1)
            results = await pipe.execute()

            current_count = results[1]
            if current_count >= limit:
                raise HTTPException(
                    status_code=429,
                    detail=f"You're sending requests too quickly. Please wait a moment (limit: {limit} per {window_seconds}s).",
                    headers={"Retry-After": str(window_seconds)},
                )
            return
        except HTTPException:
            raise
        except Exception as e:
            logger.debug("rate_limit_redis_fallback", error=str(e))

    # In-memory fallback
    mem_key = f"{category}:{user_id}"
    now_mono = time.monotonic()
    _memory_requests[mem_key] = [t for t in _memory_requests[mem_key] if now_mono - t < window_seconds]

    if len(_memory_requests[mem_key]) >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"You're sending requests too quickly. Please wait a moment (limit: {limit} per {window_seconds}s).",
            headers={"Retry-After": str(window_seconds)},
        )
    _memory_requests[mem_key].append(now_mono)
