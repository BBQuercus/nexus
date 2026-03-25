"""Request lifecycle model for frontend-backend contract.

Defines the standard states, error shapes, and degraded-state patterns
that all API responses should follow.
"""

from enum import StrEnum
from typing import Any

from pydantic import BaseModel


class RequestStatus(StrEnum):
    """Standard request lifecycle states."""

    IDLE = "idle"
    LOADING = "loading"
    STREAMING = "streaming"
    SUCCESS = "success"
    ERROR = "error"
    PARTIAL = "partial"  # Partially successful
    DEGRADED = "degraded"  # Succeeded but with reduced quality
    CANCELLED = "cancelled"  # User cancelled


class ErrorShape(BaseModel):
    """Standard error response shape for all API errors."""

    code: str  # Machine-readable error code
    message: str  # Human-readable error message
    category: str | None = None  # Error category for UI handling
    request_id: str | None = None  # For support/debugging
    details: dict[str, Any] | None = None  # Additional context
    retry_after: int | None = None  # Seconds to wait before retry
    degraded_fallback: str | None = None  # What degraded behavior is available


class DegradedState(BaseModel):
    """Describes a degraded service state for the frontend."""

    service: str  # Which service is degraded
    status: str  # "unavailable", "slow", "partial"
    message: str  # User-facing message
    fallback: str | None = None  # What fallback is in use
    since: str | None = None  # When degradation started


class APIResponse(BaseModel):
    """Standard API response envelope."""

    status: RequestStatus
    data: Any | None = None
    error: ErrorShape | None = None
    degraded: list[DegradedState] | None = None
    metadata: dict[str, Any] = {}

    class Config:
        extra = "allow"
