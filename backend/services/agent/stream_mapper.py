"""SSE event mapping and streaming response assembly."""

import json
from typing import Any


def sse_event(event: str, data: Any) -> dict:
    """Format an SSE event."""
    return {"event": event, "data": json.dumps(data) if not isinstance(data, str) else data}


def sanitize_tool_arguments(func_name: str, args: dict[str, Any]) -> dict[str, Any]:
    """Redact sensitive fields from tool arguments before sending to the client."""
    if func_name not in {"call_api", "web_browse"}:
        return args

    sanitized = dict(args)
    if "auth_value" in sanitized and sanitized["auth_value"]:
        sanitized["auth_value"] = "[REDACTED]"
    if isinstance(sanitized.get("headers"), dict):
        sanitized["headers"] = {
            key: ("[REDACTED]" if key.lower() == "authorization" else value)
            for key, value in sanitized["headers"].items()
        }
    return sanitized
