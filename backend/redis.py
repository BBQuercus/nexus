"""Redis connection manager for Nexus.

Provides async Redis client for rate limiting, caching, and pub/sub.
Falls back gracefully if Redis is unavailable.
"""

import redis.asyncio as redis

from backend.config import settings
from backend.logging_config import get_logger

logger = get_logger("redis")

_pool: redis.Redis | None = None
_available: bool = False


async def get_redis() -> redis.Redis | None:
    """Get the Redis client. Returns None if Redis is unavailable."""
    global _pool, _available

    if _pool is not None and _available:
        return _pool

    # Either first connect or reconnecting after failure
    try:
        if _pool is None:
            _pool = redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                max_connections=20,
                socket_connect_timeout=2,
                socket_timeout=2,
                retry_on_timeout=True,
            )
        # Test connection (also acts as reconnect check)
        await _pool.ping()  # type: ignore[misc]
        if not _available:
            logger.info("redis_connected", url=settings.REDIS_URL.split("@")[-1])  # Don't log auth
        _available = True
    except Exception as e:
        if _available:
            logger.warning("redis_connection_lost", error=str(e))
        else:
            logger.warning("redis_unavailable", error=str(e), hint="Falling back to in-memory rate limiting")
        _available = False

    return _pool if _available else None


async def close_redis():
    """Close Redis connection pool."""
    global _pool, _available
    if _pool:
        await _pool.close()
        _pool = None
        _available = False
        logger.info("redis_disconnected")


def is_redis_available() -> bool:
    """Check if Redis is currently available."""
    return _available
