"""Plugin registry for user-defined tools.

Users can define custom tools via the UI by specifying:
- Name, description
- URL endpoint
- Auth method and credentials
- Input/output schema
"""

import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx

from backend.logging_config import get_logger

logger = get_logger("plugins")


@dataclass
class PluginTool:
    """A user-defined tool."""
    id: str
    user_id: str
    name: str
    description: str
    url: str
    method: str = "POST"
    headers: dict[str, str] = field(default_factory=dict)
    auth_type: str = "none"  # none, bearer, basic, api_key
    auth_value: str | None = None
    input_schema: dict | None = None
    output_schema: dict | None = None
    enabled: bool = True
    timeout_seconds: int = 30
    created_at: str | None = None


# In-memory registry (will be DB-backed later)
_plugins: dict[str, PluginTool] = {}


def register_plugin(plugin: PluginTool) -> PluginTool:
    """Register a user-defined tool plugin."""
    if not plugin.id:
        plugin.id = str(uuid.uuid4())
    _plugins[plugin.id] = plugin
    logger.info("plugin_registered", plugin_id=plugin.id, plugin_name=plugin.name, user_id=plugin.user_id)
    return plugin


def list_plugins(user_id: str | None = None) -> list[PluginTool]:
    """List plugins, optionally filtered by user."""
    plugins = list(_plugins.values())
    if user_id:
        plugins = [p for p in plugins if p.user_id == user_id]
    return plugins


def get_plugin(plugin_id: str) -> PluginTool | None:
    """Get a plugin by ID."""
    return _plugins.get(plugin_id)


def delete_plugin(plugin_id: str):
    """Delete a plugin."""
    _plugins.pop(plugin_id, None)


async def execute_plugin(plugin: PluginTool, arguments: dict) -> Any:
    """Execute a plugin by calling its endpoint."""
    headers = dict(plugin.headers)
    headers["Content-Type"] = "application/json"

    if plugin.auth_type == "bearer" and plugin.auth_value:
        headers["Authorization"] = f"Bearer {plugin.auth_value}"
    elif plugin.auth_type == "api_key" and plugin.auth_value:
        headers["X-API-Key"] = plugin.auth_value

    async with httpx.AsyncClient(timeout=float(plugin.timeout_seconds)) as client:
        resp = await client.request(
            method=plugin.method,
            url=plugin.url,
            headers=headers,
            json=arguments,
        )
        resp.raise_for_status()
        try:
            return resp.json()
        except Exception:
            return {"text": resp.text}
