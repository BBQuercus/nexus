"""MCP Client for connecting to external MCP servers.

Allows Nexus to discover and use tools from MCP-compatible servers.
"""

from dataclasses import dataclass, field
from typing import Any

import httpx

from backend.logging_config import get_logger
from backend.services.tool_contracts import RetryPolicy, TimeoutPolicy, ToolContract, register_tool

logger = get_logger("mcp")


@dataclass
class MCPServer:
    """An MCP server connection."""
    id: str
    name: str
    url: str
    api_key: str | None = None
    enabled: bool = True
    tools: list[dict] = field(default_factory=list)
    last_discovered: str | None = None


# Registry of connected MCP servers
_mcp_servers: dict[str, MCPServer] = {}


async def register_mcp_server(server: MCPServer) -> MCPServer:
    """Register and discover tools from an MCP server."""
    try:
        tools = await _discover_tools(server)
        server.tools = tools
        _mcp_servers[server.id] = server

        # Register each tool as a Nexus tool contract
        for tool in tools:
            contract = ToolContract(
                name=f"mcp_{server.id}_{tool['name']}",
                description=tool.get('description', ''),
                timeout=TimeoutPolicy(timeout_seconds=35.0, description=f"MCP: {tool['name']}"),
                retry=RetryPolicy(max_retries=1),
                requires_network=True,
            )
            register_tool(contract)

        logger.info("mcp_server_registered", server_id=server.id, server_name=server.name, tools_count=len(tools))
        return server
    except Exception as e:
        logger.error("mcp_server_registration_failed", server_id=server.id, error=str(e))
        raise


async def _discover_tools(server: MCPServer) -> list[dict]:
    """Discover available tools from an MCP server."""
    headers = {}
    if server.api_key:
        headers["Authorization"] = f"Bearer {server.api_key}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{server.url}/tools", headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return data.get("tools", [])  # type: ignore[no-any-return]


async def call_mcp_tool(server_id: str, tool_name: str, arguments: dict) -> Any:
    """Execute a tool on an MCP server."""
    server = _mcp_servers.get(server_id)
    if not server:
        raise ValueError(f"MCP server not found: {server_id}")
    if not server.enabled:
        raise ValueError(f"MCP server is disabled: {server.name}")

    headers = {"Content-Type": "application/json"}
    if server.api_key:
        headers["Authorization"] = f"Bearer {server.api_key}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{server.url}/tools/{tool_name}",
            headers=headers,
            json={"arguments": arguments},
        )
        resp.raise_for_status()
        return resp.json()


def list_mcp_servers() -> list[MCPServer]:
    """List all registered MCP servers."""
    return list(_mcp_servers.values())


def get_mcp_server(server_id: str) -> MCPServer | None:
    """Get an MCP server by ID."""
    return _mcp_servers.get(server_id)


def remove_mcp_server(server_id: str):
    """Remove an MCP server."""
    _mcp_servers.pop(server_id, None)
    logger.info("mcp_server_removed", server_id=server_id)
