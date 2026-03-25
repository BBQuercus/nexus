import re
from typing import Any


def extract_artifacts(
    message_content: str, tool_calls: list[dict[str, Any]] | None = None
) -> list[dict[str, Any]]:
    """Extract artifacts from message content and tool calls.

    Detects:
    - Fenced code blocks (with language) -> code_snippet
    - Mermaid blocks -> diagram
    - write_file tool calls -> file
    - preview_app tool calls -> preview_url
    """
    artifacts: list[dict[str, Any]] = []

    if message_content:
        # Extract fenced code blocks
        code_pattern = re.compile(
            r"```(\w+)?\s*\n(.*?)```", re.DOTALL
        )
        for match in code_pattern.finditer(message_content):
            language = match.group(1) or "text"
            code = match.group(2).strip()

            if language.lower() == "mermaid":
                artifacts.append(
                    {
                        "type": "diagram",
                        "label": "Mermaid Diagram",
                        "content": code,
                        "metadata": {"language": "mermaid"},
                    }
                )
            elif language.lower() not in ("text", "plaintext", "output"):
                # Determine a label from the first line or language
                first_line = code.split("\n")[0].strip()
                label = f"{language} snippet"
                if first_line.startswith(("def ", "class ", "function ", "const ", "let ", "var ")):
                    name = first_line.split("(")[0].split(" ")[-1] if "(" in first_line else first_line.split(" ")[-1]
                    label = f"{name} ({language})"
                elif first_line.startswith(("import ", "from ", "#!", "//", "/*")):
                    label = f"{language} code"

                artifacts.append(
                    {
                        "type": "code",
                        "label": label,
                        "content": code,
                        "metadata": {"language": language},
                    }
                )

    # Extract from tool calls
    if tool_calls:
        for call in tool_calls:
            func_name = ""
            arguments = {}

            if isinstance(call, dict):
                func_info = call.get("function", call)
                func_name = func_info.get("name", "")
                args = func_info.get("arguments", {})
                if isinstance(args, str):
                    try:
                        import json
                        arguments = json.loads(args)
                    except (json.JSONDecodeError, TypeError):
                        arguments = {}
                else:
                    arguments = args
            else:
                # Handle OpenAI-style tool call objects
                if hasattr(call, "function"):
                    func_name = call.function.name
                    try:
                        import json
                        arguments = json.loads(call.function.arguments)
                    except (json.JSONDecodeError, TypeError, AttributeError):
                        arguments = {}

            if func_name == "write_file":
                path = arguments.get("path", "unknown")
                content = arguments.get("content", "")
                filename = path.split("/")[-1] if "/" in path else path
                artifacts.append(
                    {
                        "type": "document",
                        "label": filename,
                        "content": content,
                        "metadata": {"path": path},
                    }
                )

    return artifacts
