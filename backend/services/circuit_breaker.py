"""Circuit breaker for external dependencies.

States: CLOSED (normal) -> OPEN (failing, reject calls) -> HALF_OPEN (test one call)
"""

import asyncio
import time
from enum import Enum
from typing import Optional
from backend.logging_config import get_logger

logger = get_logger("circuit_breaker")


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """Async circuit breaker for protecting against cascading failures."""

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        half_open_max_calls: int = 1,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time: Optional[float] = None
        self._half_open_calls = 0
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        if self._state == CircuitState.OPEN:
            if time.monotonic() - (self._last_failure_time or 0) >= self.recovery_timeout:
                return CircuitState.HALF_OPEN
        return self._state

    async def __aenter__(self):
        async with self._lock:
            state = self.state
            if state == CircuitState.OPEN:
                raise CircuitOpenError(f"Circuit breaker '{self.name}' is OPEN")
            if state == CircuitState.HALF_OPEN:
                self._half_open_calls += 1
                if self._half_open_calls > self.half_open_max_calls:
                    raise CircuitOpenError(f"Circuit breaker '{self.name}' is HALF_OPEN (max test calls reached)")
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        async with self._lock:
            if exc_type is None:
                self._on_success()
            else:
                self._on_failure()
        return False

    def _on_success(self):
        self._failure_count = 0
        if self._state in (CircuitState.HALF_OPEN, CircuitState.OPEN):
            logger.info("circuit_breaker_closed", name=self.name)
        self._state = CircuitState.CLOSED
        self._half_open_calls = 0

    def _on_failure(self):
        self._failure_count += 1
        self._last_failure_time = time.monotonic()
        if self._failure_count >= self.failure_threshold:
            self._state = CircuitState.OPEN
            logger.warning("circuit_breaker_opened", name=self.name, failures=self._failure_count)
        elif self._state == CircuitState.HALF_OPEN:
            self._state = CircuitState.OPEN
            logger.warning("circuit_breaker_reopened", name=self.name)

    def reset(self):
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time = None
        self._half_open_calls = 0


class CircuitOpenError(Exception):
    """Raised when a circuit breaker is open."""
    pass


# Global circuit breaker instances
llm_circuit = CircuitBreaker("llm_proxy", failure_threshold=5, recovery_timeout=30.0)
sandbox_circuit = CircuitBreaker("sandbox_provider", failure_threshold=3, recovery_timeout=60.0)
retrieval_circuit = CircuitBreaker("retrieval", failure_threshold=5, recovery_timeout=30.0)
