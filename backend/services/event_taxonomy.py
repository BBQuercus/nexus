"""Structured event names for Nexus telemetry.

Usage: logger.info(Events.STREAM_STARTED, model=model, conversation_id=cid)
"""


class Events:
    # Streaming lifecycle
    STREAM_STARTED = "stream_started"
    STREAM_COMPLETED = "stream_completed"
    STREAM_ABORTED = "stream_aborted"
    STREAM_ERROR = "stream_error"

    # Tool calls
    TOOL_CALL_STARTED = "tool_call_started"
    TOOL_CALL_SUCCEEDED = "tool_call_succeeded"
    TOOL_CALL_FAILED = "tool_call_failed"
    TOOL_CALL_TIMEOUT = "tool_call_timeout"

    # Sandbox lifecycle
    SANDBOX_CREATE_STARTED = "sandbox_create_started"
    SANDBOX_CREATE_SUCCEEDED = "sandbox_create_succeeded"
    SANDBOX_CREATE_FAILED = "sandbox_create_failed"
    SANDBOX_EXECUTE_STARTED = "sandbox_execute_started"
    SANDBOX_EXECUTE_COMPLETED = "sandbox_execute_completed"
    SANDBOX_STOPPED = "sandbox_stopped"
    SANDBOX_DELETED = "sandbox_deleted"
    SANDBOX_CLEANUP = "sandbox_cleanup"

    # RAG/Retrieval
    RETRIEVAL_STARTED = "retrieval_started"
    RETRIEVAL_COMPLETED = "retrieval_completed"
    RETRIEVAL_FAILED = "retrieval_failed"
    RETRIEVAL_CACHE_HIT = "retrieval_cache_hit"
    RETRIEVAL_CACHE_MISS = "retrieval_cache_miss"

    # Artifacts
    ARTIFACT_CREATED = "artifact_created"
    ARTIFACT_UPDATED = "artifact_updated"
    ARTIFACT_DELETED = "artifact_deleted"

    # LLM
    LLM_REQUEST_STARTED = "llm_request_started"
    LLM_REQUEST_COMPLETED = "llm_request_completed"
    LLM_REQUEST_FAILED = "llm_request_failed"
    LLM_RATE_LIMITED = "llm_rate_limited"

    # Auth
    AUTH_LOGIN = "auth_login"
    AUTH_LOGOUT = "auth_logout"
    AUTH_TOKEN_REFRESH = "auth_token_refresh"
    AUTH_TOKEN_EXPIRED = "auth_token_expired"
    AUTH_FAILED = "auth_failed"

    # User-visible errors
    ERROR_VALIDATION = "error_validation"
    ERROR_NOT_FOUND = "error_not_found"
    ERROR_PERMISSION = "error_permission"
    ERROR_RATE_LIMIT = "error_rate_limit"
    ERROR_INTERNAL = "error_internal"
    ERROR_DEPENDENCY = "error_dependency"

    # WebSocket
    WS_CONNECTED = "ws_connected"
    WS_DISCONNECTED = "ws_disconnected"
    WS_ERROR = "ws_error"

    # Knowledge Base
    KB_DOCUMENT_INGESTED = "kb_document_ingested"
    KB_DOCUMENT_FAILED = "kb_document_failed"
    KB_CREATED = "kb_created"
    KB_DELETED = "kb_deleted"
