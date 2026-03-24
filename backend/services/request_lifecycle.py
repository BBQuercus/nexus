"""Request lifecycle model for frontend-backend contract.

Defines the standard states, error shapes, and degraded-state patterns
that all API responses should follow.
"""

from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel


class RequestStatus(str, Enum):
    """Standard request lifecycle states."""
    IDLE = "idle"
    LOADING = "loading"
    STREAMING = "streaming"
    SUCCESS = "success"
    ERROR = "error"
    PARTIAL = "partial"       # Partially successful
    DEGRADED = "degraded"     # Succeeded but with reduced quality
    CANCELLED = "cancelled"   # User cancelled


class ErrorShape(BaseModel):
    """Standard error response shape for all API errors."""
    code: str                              # Machine-readable error code
    message: str                           # Human-readable error message
    category: Optional[str] = None         # Error category for UI handling
    request_id: Optional[str] = None       # For support/debugging
    details: Optional[dict[str, Any]] = None  # Additional context
    retry_after: Optional[int] = None      # Seconds to wait before retry
    degraded_fallback: Optional[str] = None  # What degraded behavior is available


class DegradedState(BaseModel):
    """Describes a degraded service state for the frontend."""
    service: str           # Which service is degraded
    status: str            # "unavailable", "slow", "partial"
    message: str           # User-facing message
    fallback: Optional[str] = None  # What fallback is in use
    since: Optional[str] = None     # When degradation started


class APIResponse(BaseModel):
    """Standard API response envelope."""
    status: RequestStatus
    data: Optional[Any] = None
    error: Optional[ErrorShape] = None
    degraded: Optional[list[DegradedState]] = None
    metadata: dict[str, Any] = {}

    class Config:
        extra = "allow"
