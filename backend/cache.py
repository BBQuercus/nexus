"""Caching utilities backed by Redis with in-memory fallback."""

import contextlib
import json
import time
from typing import Any

from backend.logging_config import get_logger

logger = get_logger("cache")

# In-memory fallback cache
_memory_cache: dict[str, tuple[Any, float]] = {}  # key -> (value, expiry_timestamp)
_MAX_MEMORY_CACHE_SIZE = 1000


async def cache_get(key: str) -> Any | None:
    """Get a value from cache. Tries Redis first, falls back to memory."""
    from backend.redis import get_redis

    r = await get_redis()
    if r:
        try:
            val = await r.get(f"nexus:{key}")
            if val:
                return json.loads(val)
            return None
        except Exception as e:
            logger.debug("cache_get_redis_error", key=key, error=str(e))

    # Fallback to memory
    if key in _memory_cache:
        value, expiry = _memory_cache[key]
        if expiry > time.monotonic():
            return value
        del _memory_cache[key]
    return None


async def cache_set(key: str, value: Any, ttl_seconds: int = 300):
    """Set a value in cache with TTL."""
    from backend.redis import get_redis

    r = await get_redis()
    if r:
        try:
            await r.set(f"nexus:{key}", json.dumps(value), ex=ttl_seconds)
            return
        except Exception as e:
            logger.debug("cache_set_redis_error", key=key, error=str(e))

    # Fallback to memory
    if len(_memory_cache) >= _MAX_MEMORY_CACHE_SIZE:
        # Evict expired entries
        now = time.monotonic()
        expired = [k for k, (_, exp) in _memory_cache.items() if exp <= now]
        for k in expired:
            del _memory_cache[k]
        # If still full, evict oldest
        if len(_memory_cache) >= _MAX_MEMORY_CACHE_SIZE:
            oldest_key = min(_memory_cache, key=lambda k: _memory_cache[k][1])
            del _memory_cache[oldest_key]

    _memory_cache[key] = (value, time.monotonic() + ttl_seconds)


async def cache_delete(key: str):
    """Delete a value from cache."""
    from backend.redis import get_redis

    r = await get_redis()
    if r:
        with contextlib.suppress(Exception):
            await r.delete(f"nexus:{key}")

    _memory_cache.pop(key, None)


async def cache_clear_pattern(pattern: str):
    """Delete all keys matching a pattern (Redis only)."""
    from backend.redis import get_redis

    r = await get_redis()
    if r:
        try:
            keys = []
            async for key in r.scan_iter(f"nexus:{pattern}"):
                keys.append(key)
            if keys:
                await r.delete(*keys)
        except Exception as e:
            logger.debug("cache_clear_pattern_error", pattern=pattern, error=str(e))
