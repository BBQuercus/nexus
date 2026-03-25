"""Standardized tool contracts for Nexus.

Every tool in the system must have a ToolContract that defines:
- Input schema (Pydantic model)
- Output schema (typed result)
- Timeout policy
- Retry policy
- Redaction rules (what to strip from logs/SSE)
- Error classification
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from pydantic import BaseModel

# ── Timeout Policy ──


@dataclass(frozen=True)
class TimeoutPolicy:
    """Timeout configuration for a tool execution."""

    timeout_seconds: float
    description: str = ""


# Pre-defined timeout policies matching actual usage in the codebase
WEB_TIMEOUT = TimeoutPolicy(timeout_seconds=15.0, description="HTTP API calls")
BROWSE_TIMEOUT = TimeoutPolicy(timeout_seconds=10.0, description="Web page browsing")
SEARCH_TIMEOUT = TimeoutPolicy(timeout_seconds=15.0, description="Web search via SerpAPI")
SANDBOX_TIMEOUT = TimeoutPolicy(timeout_seconds=120.0, description="Sandbox code execution (2 min)")
CHART_TIMEOUT = TimeoutPolicy(timeout_seconds=15.0, description="Chart spec validation")
RAG_TIMEOUT = TimeoutPolicy(timeout_seconds=30.0, description="Knowledge base retrieval")
FILE_IO_TIMEOUT = TimeoutPolicy(timeout_seconds=30.0, description="Sandbox file I/O")
PREVIEW_TIMEOUT = TimeoutPolicy(timeout_seconds=10.0, description="Preview URL generation")


# ── Error Classification ──


class ToolErrorCategory(Enum):
    """Classifies tool errors for consistent handling."""

    VALIDATION = "validation"  # Bad input
    TIMEOUT = "timeout"  # Operation timed out
    RATE_LIMITED = "rate_limited"  # External rate limit
    DEPENDENCY_DOWN = "dependency_down"  # External service unavailable
    PERMISSION = "permission"  # Not authorized
    NOT_FOUND = "not_found"  # Resource not found
    INTERNAL = "internal"  # Unexpected error
    USER_CANCELLED = "user_cancelled"  # User aborted


class ToolStatus(Enum):
    """Standard tool execution statuses."""

    SUCCESS = "success"
    PARTIAL = "partial"  # Partially successful (e.g., truncated results)
    FAILED = "failed"
    TIMEOUT = "timeout"
    SKIPPED = "skipped"  # Skipped due to circuit breaker or missing dependency


# ── Redaction ──


@dataclass(frozen=True)
class RedactionRule:
    """What to strip from tool results before logging/SSE."""

    fields: tuple[str, ...] = ()  # Field paths to redact
    patterns: tuple[str, ...] = ()  # Regex patterns to redact


# ── Retry ──


@dataclass(frozen=True)
class RetryPolicy:
    """Retry configuration for a tool."""

    max_retries: int = 0
    retryable_categories: tuple[ToolErrorCategory, ...] = (
        ToolErrorCategory.TIMEOUT,
        ToolErrorCategory.RATE_LIMITED,
        ToolErrorCategory.DEPENDENCY_DOWN,
    )
    backoff_base: float = 1.0
    backoff_max: float = 30.0

    def should_retry(self, category: ToolErrorCategory, attempt: int) -> bool:
        """Return True if this error category is retryable and attempts remain."""
        return attempt < self.max_retries and category in self.retryable_categories

    def delay_seconds(self, attempt: int) -> float:
        """Exponential backoff delay for the given attempt (0-indexed)."""
        delay = self.backoff_base * (2**attempt)
        return float(min(delay, self.backoff_max))


# ── Result Envelope ──


class ToolResult(BaseModel):
    """Standard result envelope for all tool executions."""

    tool_name: str
    status: ToolStatus
    result: Any = None
    error: str | None = None
    error_category: ToolErrorCategory | None = None
    duration_ms: float | None = None
    truncated: bool = False
    metadata: dict[str, Any] = {}

    model_config = {"use_enum_values": True}


# ── Tool Contract ──


@dataclass(frozen=True)
class ToolContract:
    """Defines the complete contract for a tool."""

    name: str
    description: str
    timeout: TimeoutPolicy
    retry: RetryPolicy = field(default_factory=RetryPolicy)
    redaction: RedactionRule = field(default_factory=RedactionRule)
    requires_sandbox: bool = False
    requires_network: bool = False
    max_result_chars: int = 50_000

    def classify_error(self, error: Exception) -> ToolErrorCategory:
        """Classify an exception into a standard error category."""
        if isinstance(error, asyncio.TimeoutError):
            return ToolErrorCategory.TIMEOUT

        # httpx errors
        try:
            import httpx

            if isinstance(error, httpx.TimeoutException):
                return ToolErrorCategory.TIMEOUT
            if isinstance(error, httpx.HTTPStatusError):
                code = error.response.status_code
                if code == 429:
                    return ToolErrorCategory.RATE_LIMITED
                if code in (401, 403):
                    return ToolErrorCategory.PERMISSION
                if code == 404:
                    return ToolErrorCategory.NOT_FOUND
                if code >= 500:
                    return ToolErrorCategory.DEPENDENCY_DOWN
        except ImportError:
            pass

        if isinstance(error, PermissionError):
            return ToolErrorCategory.PERMISSION
        if isinstance(error, FileNotFoundError):
            return ToolErrorCategory.NOT_FOUND
        if isinstance(error, (ConnectionError, OSError)):
            return ToolErrorCategory.DEPENDENCY_DOWN
        if isinstance(error, (ValueError, TypeError)):
            return ToolErrorCategory.VALIDATION

        return ToolErrorCategory.INTERNAL

    def build_result(
        self,
        *,
        result: Any = None,
        error: Exception | None = None,
        started_at: float | None = None,
        truncated: bool = False,
        metadata: dict[str, Any] | None = None,
    ) -> ToolResult:
        """Build a standardised ToolResult for this contract."""
        duration_ms = (
            round((time.monotonic() - started_at) * 1000, 1) if started_at else None
        )

        if error is not None:
            category = self.classify_error(error)
            status = (
                ToolStatus.TIMEOUT
                if category is ToolErrorCategory.TIMEOUT
                else ToolStatus.FAILED
            )
            return ToolResult(
                tool_name=self.name,
                status=status,
                error=str(error),
                error_category=category,
                duration_ms=duration_ms,
                metadata=metadata or {},
            )

        return ToolResult(
            tool_name=self.name,
            status=ToolStatus.PARTIAL if truncated else ToolStatus.SUCCESS,
            result=result,
            duration_ms=duration_ms,
            truncated=truncated,
            metadata=metadata or {},
        )


# ── Registry ──

TOOL_CONTRACTS: dict[str, ToolContract] = {}


def register_tool(contract: ToolContract) -> ToolContract:
    """Register a tool contract in the global registry."""
    TOOL_CONTRACTS[contract.name] = contract
    return contract


def get_contract(tool_name: str) -> ToolContract | None:
    """Get the contract for a tool, or None if unregistered."""
    return TOOL_CONTRACTS.get(tool_name)


# ── Built-in Tool Contracts ──
# These match the tools defined in backend/prompts/tools.py and executed
# in backend/services/agent.py.

call_api_contract = register_tool(
    ToolContract(
        name="call_api",
        description="Make HTTP requests to external APIs",
        timeout=WEB_TIMEOUT,
        retry=RetryPolicy(
            max_retries=1,
            retryable_categories=(
                ToolErrorCategory.TIMEOUT,
                ToolErrorCategory.RATE_LIMITED,
            ),
        ),
        redaction=RedactionRule(
            fields=("auth_value", "headers.Authorization", "headers.authorization"),
        ),
        requires_network=True,
        max_result_chars=8_000,  # matches MAX_API_BODY_CHARS in web.py
    )
)

web_browse_contract = register_tool(
    ToolContract(
        name="web_browse",
        description="Fetch and extract readable content from web pages",
        timeout=BROWSE_TIMEOUT,
        retry=RetryPolicy(max_retries=1),
        requires_network=True,
        max_result_chars=4_000,  # matches MAX_BROWSE_TEXT_CHARS in web.py
    )
)

web_search_contract = register_tool(
    ToolContract(
        name="web_search",
        description="Search the web using SerpAPI",
        timeout=SEARCH_TIMEOUT,
        retry=RetryPolicy(max_retries=1),
        requires_network=True,
    )
)

execute_code_contract = register_tool(
    ToolContract(
        name="execute_code",
        description="Execute code in a Daytona sandbox (Python, JS, TS, Bash)",
        timeout=SANDBOX_TIMEOUT,
        retry=RetryPolicy(max_retries=0),
        requires_sandbox=True,
    )
)

write_file_contract = register_tool(
    ToolContract(
        name="write_file",
        description="Write content to a file in the sandbox",
        timeout=FILE_IO_TIMEOUT,
        retry=RetryPolicy(max_retries=0),
        requires_sandbox=True,
    )
)

read_file_contract = register_tool(
    ToolContract(
        name="read_file",
        description="Read the contents of a file in the sandbox",
        timeout=FILE_IO_TIMEOUT,
        retry=RetryPolicy(max_retries=0),
        requires_sandbox=True,
    )
)

list_files_contract = register_tool(
    ToolContract(
        name="list_files",
        description="List files and directories at a path in the sandbox",
        timeout=FILE_IO_TIMEOUT,
        retry=RetryPolicy(max_retries=0),
        requires_sandbox=True,
    )
)

create_chart_contract = register_tool(
    ToolContract(
        name="create_chart",
        description="Create interactive Vega-Lite charts",
        timeout=CHART_TIMEOUT,
        retry=RetryPolicy(max_retries=0),
        max_result_chars=1_000_000,  # chart specs can be large
    )
)

run_sql_contract = register_tool(
    ToolContract(
        name="run_sql",
        description="Run SQL queries on data files using DuckDB in the sandbox",
        timeout=SANDBOX_TIMEOUT,
        retry=RetryPolicy(max_retries=0),
        requires_sandbox=True,
    )
)

preview_app_contract = register_tool(
    ToolContract(
        name="preview_app",
        description="Get a preview URL for a web app running on a sandbox port",
        timeout=PREVIEW_TIMEOUT,
        retry=RetryPolicy(max_retries=0),
        requires_sandbox=True,
    )
)

FORM_TIMEOUT = TimeoutPolicy(timeout_seconds=15.0, description="Form creation")

create_ui_contract = register_tool(
    ToolContract(
        name="create_ui",
        description="Create interactive forms and questionnaires",
        timeout=FORM_TIMEOUT,
        retry=RetryPolicy(max_retries=0),
        max_result_chars=100_000,
    )
)

knowledge_search_contract = register_tool(
    ToolContract(
        name="knowledge_search",
        description="Search uploaded documents and knowledge bases via RAG retrieval",
        timeout=RAG_TIMEOUT,
        retry=RetryPolicy(max_retries=1),
    )
)
