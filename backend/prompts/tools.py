
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "call_api",
            "description": "Make an HTTP request to an external API. Use this for fetching data from APIs, webhooks, and HTTP endpoints without sandbox execution.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to request",
                    },
                    "method": {
                        "type": "string",
                        "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"],
                        "default": "GET",
                    },
                    "headers": {
                        "type": "object",
                        "additionalProperties": {"type": "string"},
                        "description": "Optional request headers",
                    },
                    "body": {
                        "type": "string",
                        "description": "Optional request body",
                    },
                    "auth_type": {
                        "type": "string",
                        "enum": ["none", "bearer", "basic"],
                        "default": "none",
                    },
                    "auth_value": {
                        "type": "string",
                        "description": "Bearer token or base64 basic auth payload",
                    },
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_browse",
            "description": "Fetch and read the content of a webpage. Returns extracted text, title, and metadata for articles, documentation, and general web pages.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to read",
                    },
                    "extract_links": {
                        "type": "boolean",
                        "default": False,
                        "description": "Whether to include links found on the page",
                    },
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_chart",
            "description": "Create an interactive chart using a Vega-Lite specification. Use this for interactive visualizations instead of static chart images.",
            "parameters": {
                "type": "object",
                "properties": {
                    "spec": {
                        "type": "object",
                        "description": "The complete Vega-Lite specification, including inline data",
                    },
                    "title": {
                        "type": "string",
                        "description": "Optional title for the chart artifact",
                    },
                },
                "required": ["spec"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_sql",
            "description": "Run a SQL query on data files using DuckDB. CSV, Excel, and Parquet files in the sandbox are auto-registered as tables.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sql": {
                        "type": "string",
                        "description": "The SQL query to execute",
                    },
                    "output_format": {
                        "type": "string",
                        "enum": ["table", "csv", "json"],
                        "default": "table",
                    },
                },
                "required": ["sql"],
            },
        },
    },
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
    {
        "type": "function",
        "function": {
            "name": "create_ui",
            "description": "Create an interactive form or questionnaire. The user fills it out and the response is sent back to you as structured data.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Form title"},
                    "description": {
                        "type": "string",
                        "description": "Instructions for the user",
                    },
                    "fields": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {
                                    "type": "string",
                                    "description": "Unique field identifier",
                                },
                                "type": {
                                    "type": "string",
                                    "enum": [
                                        "text",
                                        "textarea",
                                        "number",
                                        "select",
                                        "multiselect",
                                        "checkbox",
                                        "radio",
                                        "date",
                                        "slider",
                                        "rating",
                                    ],
                                    "description": "Field type",
                                },
                                "label": {"type": "string"},
                                "placeholder": {"type": "string"},
                                "required": {"type": "boolean", "default": False},
                                "default": {},
                                "options": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "For select/radio/multiselect",
                                },
                                "validation": {
                                    "type": "object",
                                    "properties": {
                                        "min": {"type": "number"},
                                        "max": {"type": "number"},
                                        "pattern": {"type": "string"},
                                        "message": {"type": "string"},
                                    },
                                },
                                "condition": {
                                    "type": "object",
                                    "properties": {
                                        "field": {"type": "string"},
                                        "equals": {},
                                    },
                                    "description": "Show only when another field has specific value",
                                },
                            },
                            "required": ["id", "type", "label"],
                        },
                    },
                    "submit_label": {"type": "string", "default": "Submit"},
                    "allow_multiple": {
                        "type": "boolean",
                        "default": False,
                        "description": "Allow resubmission",
                    },
                },
                "required": ["title", "fields"],
            },
        },
    },
]

KNOWLEDGE_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "knowledge_search",
        "description": (
            "Search uploaded documents and knowledge bases for relevant information. "
            "Use this when the user asks about data, facts, or content from uploaded files, "
            "documents, or knowledge bases. Returns relevant passages with source citations."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query. Be specific and include key terms from the user's question.",
                },
                "knowledge_base_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional: specific knowledge base IDs to search. If omitted, searches all available sources.",
                },
            },
            "required": ["query"],
        },
    },
}


def get_tools_for_mode(
    mode: str,
    tools_enabled: list[str] | None = None,
    has_knowledge: bool = False,
) -> list[dict]:
    """Get the tools available for a given agent mode.

    Args:
        mode: One of 'chat', 'code', 'architect'
        tools_enabled: Optional list of specific tool names to enable
        has_knowledge: Whether knowledge bases or documents are available

    Returns:
        List of tool definitions for function calling
    """
    if tools_enabled is not None:  # noqa: SIM108
        base = [t for t in TOOLS if t["function"]["name"] in tools_enabled]  # type: ignore[index]
    else:
        base = list(TOOLS)

    if has_knowledge:
        base.append(KNOWLEDGE_SEARCH_TOOL)

    return base
