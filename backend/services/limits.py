"""Defensive limits for the Nexus platform."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Limits:
    """Configurable operational limits."""

    # Agent run limits
    MAX_TOOL_ITERATIONS_PER_RUN: int = 25
    MAX_TOOL_CALLS_PER_MESSAGE: int = 10

    # Content limits
    MAX_ARTIFACT_SIZE_BYTES: int = 10 * 1024 * 1024  # 10MB
    MAX_UPLOAD_SIZE_BYTES: int = 50 * 1024 * 1024  # 50MB
    MAX_CHART_SPEC_SIZE_BYTES: int = 1 * 1024 * 1024  # 1MB
    MAX_MESSAGE_LENGTH: int = 100_000  # characters
    MAX_GENERATED_TABLE_ROWS: int = 10_000

    # Session limits
    MAX_MESSAGES_PER_CONVERSATION: int = 500
    MAX_CONVERSATIONS_PER_USER: int = 1_000
    MAX_KNOWLEDGE_BASES_PER_USER: int = 50
    MAX_DOCUMENTS_PER_KNOWLEDGE_BASE: int = 500

    # Rate limits (per user)
    RATE_LIMIT_CHAT_PER_MINUTE: int = 60
    RATE_LIMIT_SANDBOX_PER_MINUTE: int = 10
    RATE_LIMIT_UPLOAD_PER_MINUTE: int = 20
    RATE_LIMIT_API_CALLS_PER_MINUTE: int = 30

    # Sandbox limits
    MAX_SANDBOX_IDLE_HOURS: int = 4
    MAX_SANDBOXES_PER_USER: int = 5
    SANDBOX_EXECUTION_TIMEOUT_SECONDS: int = 120


# Global instance
limits = Limits()


def check_upload_size(content_length: int | None, filename: str = ""):
    """Check upload size BEFORE reading into memory. Raise early."""
    from fastapi import HTTPException

    if content_length and content_length > limits.MAX_UPLOAD_SIZE_BYTES:
        max_mb = limits.MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File '{filename}' exceeds maximum upload size of {max_mb:.0f}MB",
        )


def check_message_length(content: str):
    """Check message length before processing."""
    from fastapi import HTTPException

    if len(content) > limits.MAX_MESSAGE_LENGTH:
        raise HTTPException(
            status_code=413,
            detail=f"Message exceeds maximum length of {limits.MAX_MESSAGE_LENGTH:,} characters",
        )
