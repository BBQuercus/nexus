from typing import Optional

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "execute_code",
            "description": "Execute code in the sandboxed environment. Supports Python, JavaScript, TypeScript, and Bash.",
            "parameters": {
                "type": "object",
                "properties": {
                    "language": {
                        "type": "string",
                        "enum": ["python", "javascript", "typescript", "bash"],
                        "description": "The programming language to execute",
                    },
                    "code": {
                        "type": "string",
                        "description": "The code to execute",
                    },
                },
                "required": ["language", "code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write content to a file in the sandbox. Creates the file if it doesn't exist, overwrites if it does.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The absolute file path in the sandbox",
                    },
                    "content": {
                        "type": "string",
                        "description": "The content to write to the file",
                    },
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of a file in the sandbox.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The absolute file path to read",
                    },
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List files and directories at the given path in the sandbox.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The directory path to list",
                        "default": "/home/daytona",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for information. Returns titles, URLs, and snippets.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query",
                    },
                    "num_results": {
                        "type": "integer",
                        "description": "Number of results to return (default 5)",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "preview_app",
            "description": "Get a preview URL for a web application running on a specific port in the sandbox.",
            "parameters": {
                "type": "object",
                "properties": {
                    "port": {
                        "type": "integer",
                        "description": "The port number the app is running on",
                    },
                },
                "required": ["port"],
            },
        },
    },
]


def get_tools_for_mode(
    mode: str, tools_enabled: Optional[list[str]] = None
) -> list[dict]:
    """Get the tools available for a given agent mode.

    Args:
        mode: One of 'chat', 'code', 'architect'
        tools_enabled: Optional list of specific tool names to enable

    Returns:
        List of tool definitions for function calling
    """
    if mode == "chat":
        # Chat mode only gets web_search
        return [t for t in TOOLS if t["function"]["name"] == "web_search"]

    if tools_enabled is not None:
        return [t for t in TOOLS if t["function"]["name"] in tools_enabled]

    # Code and architect modes get all tools
    return TOOLS
