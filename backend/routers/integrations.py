import uuid
from datetime import UTC

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth import get_current_user
from backend.logging_config import get_logger
from backend.services.mcp_client import (
    MCPServer,
    get_mcp_server,
    list_mcp_servers,
    register_mcp_server,
    remove_mcp_server,
)
from backend.services.plugin_registry import (
    PluginTool,
    delete_plugin,
    get_plugin,
    list_plugins,
    register_plugin,
)

logger = get_logger("integrations_router")

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


# ----- MCP Schemas -----


class RegisterMCPRequest(BaseModel):
    name: str
    url: str
    api_key: str | None = None


class MCPServerResponse(BaseModel):
    id: str
    name: str
    url: str
    enabled: bool
    tools: list[dict]
    last_discovered: str | None = None


def _mcp_to_dict(server: MCPServer) -> dict:
    return {
        "id": server.id,
        "name": server.name,
        "url": server.url,
        "enabled": server.enabled,
        "tools": server.tools,
        "last_discovered": server.last_discovered,
    }


# ----- Plugin Schemas -----


class CreatePluginRequest(BaseModel):
    name: str
    description: str
    url: str
    method: str = "POST"
    headers: dict[str, str] = {}
    auth_type: str = "none"
    auth_value: str | None = None
    input_schema: dict | None = None
    output_schema: dict | None = None
    timeout_seconds: int = 30


class UpdatePluginRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    url: str | None = None
    method: str | None = None
    headers: dict[str, str] | None = None
    auth_type: str | None = None
    auth_value: str | None = None
    input_schema: dict | None = None
    output_schema: dict | None = None
    enabled: bool | None = None
    timeout_seconds: int | None = None


def _plugin_to_dict(plugin: PluginTool) -> dict:
    return {
        "id": plugin.id,
        "name": plugin.name,
        "description": plugin.description,
        "url": plugin.url,
        "method": plugin.method,
        "auth_type": plugin.auth_type,
        "input_schema": plugin.input_schema,
        "output_schema": plugin.output_schema,
        "enabled": plugin.enabled,
        "timeout_seconds": plugin.timeout_seconds,
        "created_at": plugin.created_at,
    }


# ----- MCP Routes -----


@router.get("/mcp")
async def list_mcp(
    user_id: uuid.UUID = Depends(get_current_user),
):
    """List all registered MCP servers."""
    servers = list_mcp_servers()
    return [_mcp_to_dict(s) for s in servers]


@router.post("/mcp")
async def register_mcp(
    body: RegisterMCPRequest,
    user_id: uuid.UUID = Depends(get_current_user),
):
    """Register a new MCP server and discover its tools."""
    server = MCPServer(
        id=str(uuid.uuid4()),
        name=body.name,
        url=body.url.rstrip("/"),
        api_key=body.api_key,
    )
    try:
        registered = await register_mcp_server(server)
        return _mcp_to_dict(registered)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to connect to MCP server: {str(e)}",
        ) from e


@router.delete("/mcp/{server_id}")
async def delete_mcp(
    server_id: str,
    user_id: uuid.UUID = Depends(get_current_user),
):
    """Remove an MCP server."""
    server = get_mcp_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")
    remove_mcp_server(server_id)
    return {"ok": True}


# ----- Plugin Routes -----


@router.get("/plugins")
async def list_user_plugins(
    user_id: uuid.UUID = Depends(get_current_user),
):
    """List plugins for the current user."""
    plugins = list_plugins(user_id=str(user_id))
    return [_plugin_to_dict(p) for p in plugins]


@router.post("/plugins")
async def create_plugin(
    body: CreatePluginRequest,
    user_id: uuid.UUID = Depends(get_current_user),
):
    """Create a new user-defined plugin."""
    from datetime import datetime

    plugin = PluginTool(
        id=str(uuid.uuid4()),
        user_id=str(user_id),
        name=body.name,
        description=body.description,
        url=body.url,
        method=body.method,
        headers=body.headers,
        auth_type=body.auth_type,
        auth_value=body.auth_value,
        input_schema=body.input_schema,
        output_schema=body.output_schema,
        timeout_seconds=body.timeout_seconds,
        created_at=datetime.now(UTC).isoformat(),
    )
    registered = register_plugin(plugin)
    return _plugin_to_dict(registered)


@router.put("/plugins/{plugin_id}")
async def update_plugin(
    plugin_id: str,
    body: UpdatePluginRequest,
    user_id: uuid.UUID = Depends(get_current_user),
):
    """Update a user-defined plugin."""
    plugin = get_plugin(plugin_id)
    if not plugin or plugin.user_id != str(user_id):
        raise HTTPException(status_code=404, detail="Plugin not found")

    # Apply updates
    for field_name, value in body.model_dump(exclude_unset=True).items():
        setattr(plugin, field_name, value)

    return _plugin_to_dict(plugin)


@router.delete("/plugins/{plugin_id}")
async def delete_user_plugin(
    plugin_id: str,
    user_id: uuid.UUID = Depends(get_current_user),
):
    """Delete a user-defined plugin."""
    plugin = get_plugin(plugin_id)
    if not plugin or plugin.user_id != str(user_id):
        raise HTTPException(status_code=404, detail="Plugin not found")
    delete_plugin(plugin_id)
    return {"ok": True}
