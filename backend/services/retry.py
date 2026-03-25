"""Retry utilities with exponential backoff."""

import asyncio
import random
from collections.abc import Callable

from backend.logging_config import get_logger

logger = get_logger("retry")


async def retry_async(
    func: Callable,
    *args,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    backoff_factor: float = 2.0,
    retryable_exceptions: set[type[Exception]] | None = None,
    retryable_status_codes: set[int] | None = None,
    operation_name: str = "operation",
    **kwargs,
):
    """Execute an async function with exponential backoff retry.

    Args:
        func: Async function to execute
        max_retries: Maximum number of retry attempts
        base_delay: Initial delay in seconds
        max_delay: Maximum delay between retries
        backoff_factor: Multiplier for delay after each retry
        retryable_exceptions: Exception types to retry on
        retryable_status_codes: HTTP status codes to retry on (for httpx responses)
        operation_name: Name for logging
    """
    retryable_exceptions = retryable_exceptions or {Exception}
    last_exception: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            result = await func(*args, **kwargs)

            # Check for retryable status codes on httpx-like responses
            if retryable_status_codes and hasattr(result, 'status_code') and result.status_code in retryable_status_codes and attempt < max_retries:
                delay = min(base_delay * (backoff_factor ** attempt), max_delay)
                delay += random.uniform(0, delay * 0.1)  # jitter
                logger.warning(
                    "retry_on_status",
                    operation=operation_name,
                    attempt=attempt + 1,
                    status_code=result.status_code,
                    delay=round(delay, 2),
                )
                await asyncio.sleep(delay)
                continue

            return result

        except Exception as e:
            last_exception = e
            is_retryable = any(isinstance(e, exc_type) for exc_type in retryable_exceptions)

            if not is_retryable or attempt >= max_retries:
                raise

            delay = min(base_delay * (backoff_factor ** attempt), max_delay)
            delay += random.uniform(0, delay * 0.1)  # jitter

            logger.warning(
                "retry_on_exception",
                operation=operation_name,
                attempt=attempt + 1,
                max_retries=max_retries,
                error=str(e),
                error_type=type(e).__name__,
                delay=round(delay, 2),
            )
            await asyncio.sleep(delay)

    raise last_exception  # type: ignore[misc]  # Should never reach here, but just in case
