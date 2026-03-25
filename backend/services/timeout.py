"""Timeout policies for external dependencies."""

from dataclasses import dataclass


@dataclass(frozen=True)
class TimeoutPolicy:
    """Timeout configuration for a dependency class."""

    connect_timeout: float  # seconds
    read_timeout: float  # seconds
    total_timeout: float  # seconds
    description: str = ""


# Named timeout policies
LLM_TIMEOUT = TimeoutPolicy(
    connect_timeout=10.0,
    read_timeout=120.0,  # LLM streaming can be slow
    total_timeout=180.0,
    description="LLM proxy calls (streaming)",
)

TOOL_WEB_TIMEOUT = TimeoutPolicy(
    connect_timeout=5.0,
    read_timeout=15.0,
    total_timeout=20.0,
    description="Web browsing and API calls",
)

SANDBOX_CREATE_TIMEOUT = TimeoutPolicy(
    connect_timeout=5.0,
    read_timeout=30.0,
    total_timeout=45.0,
    description="Sandbox creation",
)

SANDBOX_EXECUTE_TIMEOUT = TimeoutPolicy(
    connect_timeout=5.0,
    read_timeout=120.0,
    total_timeout=130.0,
    description="Sandbox code execution",
)

EMBEDDING_TIMEOUT = TimeoutPolicy(
    connect_timeout=5.0,
    read_timeout=30.0,
    total_timeout=35.0,
    description="Embedding generation",
)

SEARCH_TIMEOUT = TimeoutPolicy(
    connect_timeout=5.0,
    read_timeout=10.0,
    total_timeout=15.0,
    description="Web search",
)

DB_QUERY_TIMEOUT = TimeoutPolicy(
    connect_timeout=5.0,
    read_timeout=30.0,
    total_timeout=30.0,
    description="Database queries",
)


def to_httpx_timeout(policy: TimeoutPolicy):
    """Convert to httpx.Timeout object."""
    import httpx

    return httpx.Timeout(
        connect=policy.connect_timeout,
        read=policy.read_timeout,
        write=policy.read_timeout,
        pool=policy.connect_timeout,
    )
