"""Background cleanup jobs for Nexus.

These run periodically to clean up orphaned resources.
"""

import asyncio
from datetime import datetime, timezone, timedelta
from backend.db import async_session
from backend.logging_config import get_logger

logger = get_logger("cleanup")

# Configuration
CLEANUP_INTERVAL_SECONDS = 300  # 5 minutes
STALE_SANDBOX_HOURS = 4
ORPHANED_STREAM_TIMEOUT_SECONDS = 300  # 5 minutes

# Track active streams for cleanup
_active_streams: dict[str, datetime] = {}


def register_stream(stream_id: str):
    """Register an active SSE stream."""
    _active_streams[stream_id] = datetime.now(timezone.utc)


def unregister_stream(stream_id: str):
    """Unregister a completed SSE stream."""
    _active_streams.pop(stream_id, None)


def get_active_stream_count() -> int:
    """Get count of active streams."""
    return len(_active_streams)


async def cleanup_orphaned_streams():
    """Find and clean up streams that have been active too long (likely orphaned)."""
    now = datetime.now(timezone.utc)
    orphaned = []
    for stream_id, started_at in list(_active_streams.items()):
        if (now - started_at).total_seconds() > ORPHANED_STREAM_TIMEOUT_SECONDS:
            orphaned.append(stream_id)

    for stream_id in orphaned:
        _active_streams.pop(stream_id, None)
        logger.warning("orphaned_stream_cleaned", stream_id=stream_id)

    if orphaned:
        logger.info("orphaned_streams_cleanup", count=len(orphaned))


async def cleanup_expired_analytics(days_to_keep: int = 90):
    """Remove analytics events older than retention period."""
    from sqlalchemy import text
    try:
        async with async_session() as session:
            cutoff = datetime.now(timezone.utc) - timedelta(days=days_to_keep)
            result = await session.execute(
                text("DELETE FROM analytics_events WHERE created_at < :cutoff"),
                {"cutoff": cutoff},
            )
            deleted = result.rowcount
            await session.commit()
            if deleted:
                logger.info("analytics_cleanup", deleted=deleted, days_kept=days_to_keep)
    except Exception as e:
        logger.error("analytics_cleanup_failed", error=str(e))


async def run_cleanup_cycle():
    """Run all cleanup tasks."""
    logger.info("cleanup_cycle_started")
    await cleanup_orphaned_streams()
    await cleanup_expired_analytics()
    logger.info("cleanup_cycle_completed")


async def start_cleanup_loop():
    """Start the background cleanup loop. Call during app lifespan."""
    while True:
        try:
            await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
            await run_cleanup_cycle()
        except asyncio.CancelledError:
            logger.info("cleanup_loop_stopped")
            break
        except Exception as e:
            logger.error("cleanup_loop_error", error=str(e))
            await asyncio.sleep(60)  # Wait before retrying
