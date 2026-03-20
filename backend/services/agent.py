import json
import logging
import time
import uuid
from typing import Any, AsyncGenerator, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Artifact, Conversation, Message, UsageLog
from backend.prompts.system import build_system_prompt
from backend.prompts.tools import get_tools_for_mode
from backend.services import extraction
from backend.services import llm as llm_service
from backend.services import sandbox as sandbox_service
from backend.services.search import web_search

logger = logging.getLogger(__name__)


def _detect_table(output: str) -> Optional[list[list[str]]]:
    """Simple heuristic to detect tabular output.

    Returns parsed rows if output looks like a table, None otherwise.
    """
    lines = output.strip().split("\n")
    if len(lines) < 3:
        return None

    # Check for pipe-delimited tables (markdown tables)
    pipe_lines = [l for l in lines if "|" in l]
    if len(pipe_lines) >= 3:
        rows = []
        for line in pipe_lines:
            cells = [c.strip() for c in line.strip("|").split("|")]
            # Skip separator lines (e.g., |---|---|)
            if all(set(c.strip()) <= {"-", ":", " "} for c in cells):
                continue
            rows.append(cells)
        if len(rows) >= 2:
            return rows

    # Check for whitespace-aligned columns
    # If 3+ consecutive lines have similar "word boundary" positions, treat as table
    non_empty = [l for l in lines if l.strip()]
    if len(non_empty) >= 3:
        import re

        split_counts = [len(re.split(r"\s{2,}", l.strip())) for l in non_empty[:10]]
        if all(c >= 2 for c in split_counts) and max(split_counts) - min(split_counts) <= 1:
            rows = []
            for line in non_empty:
                cells = re.split(r"\s{2,}", line.strip())
                rows.append(cells)
            return rows

    return None


def _sse_event(event: str, data: Any) -> dict:
    """Format an SSE event."""
    return {"event": event, "data": json.dumps(data) if not isinstance(data, str) else data}


async def run_agent_loop(
    conversation_id: uuid.UUID,
    user_message: str,
    model: str,
    mode: str,
    persona: Optional[object],
    sandbox_id: Optional[str],
    db: AsyncSession,
) -> AsyncGenerator[dict, None]:
    """Run the agent loop, yielding SSE events.

    The loop: send messages to LLM, if tool_calls in response -> execute tools ->
    feed results back -> repeat until final text response.
    """
    start_time = time.monotonic()

    # Load conversation messages
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    existing_messages = result.scalars().all()

    # Build message history for LLM
    system_prompt = build_system_prompt(mode, persona)
    llm_messages: list[dict] = [{"role": "system", "content": system_prompt}]

    for msg in existing_messages:
        entry: dict[str, Any] = {"role": msg.role, "content": msg.content or ""}
        if msg.tool_calls and msg.role == "assistant":
            entry["tool_calls"] = msg.tool_calls
            if not entry["content"]:
                entry.pop("content", None)
        if msg.role == "tool" and msg.tool_result:
            entry["content"] = json.dumps(msg.tool_result) if isinstance(msg.tool_result, dict) else str(msg.tool_result)
            entry["tool_call_id"] = msg.tool_result.get("tool_call_id", "") if isinstance(msg.tool_result, dict) else ""
        llm_messages.append(entry)

    # Add new user message
    llm_messages.append({"role": "user", "content": user_message})

    # Get tools
    tools_enabled = None
    if persona and hasattr(persona, "tools_enabled"):
        tools_enabled = persona.tools_enabled
    tools = get_tools_for_mode(mode, tools_enabled)
    logger.info(f"Agent loop: mode={mode}, model={model}, tools={len(tools) if tools else 0}")

    # Track sandbox and known output files
    sandbox = None
    known_output_files: set[str] = set()
    if sandbox_id:
        try:
            sandbox = await sandbox_service.get_sandbox(sandbox_id)
            existing_files = await sandbox_service.check_output_files(sandbox, set())
            known_output_files = set(existing_files)
        except Exception:
            pass

    # Load conversation for sandbox_id updates
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conversation = conv_result.scalar_one()

    total_input_tokens = 0
    total_output_tokens = 0
    max_iterations = 15
    iteration = 0
    assistant_content = ""
    assistant_reasoning = ""
    all_tool_calls_raw: list[dict] = []

    while iteration < max_iterations:
        iteration += 1

        # Accumulate streamed response
        current_content = ""
        current_reasoning = ""
        current_tool_calls: list[dict] = []
        tool_call_buffers: dict[int, dict] = {}
        input_tokens = 0
        output_tokens = 0

        try:
            async for chunk in llm_service.stream_chat(
                llm_messages, model, tools=tools if tools else None
            ):
                if not chunk.choices and hasattr(chunk, "usage") and chunk.usage:
                    input_tokens = chunk.usage.prompt_tokens or 0
                    output_tokens = chunk.usage.completion_tokens or 0
                    continue

                if not chunk.choices:
                    continue

                delta = chunk.choices[0].delta

                # Text content
                if delta.content:
                    current_content += delta.content
                    yield _sse_event("token", {"content": delta.content})

                # Reasoning (some models support this)
                if hasattr(delta, "reasoning_content") and delta.reasoning_content:
                    current_reasoning += delta.reasoning_content
                    yield _sse_event("reasoning", {"content": delta.reasoning_content})

                # Tool calls
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_call_buffers:
                            tool_call_buffers[idx] = {
                                "id": tc.id or "",
                                "type": "function",
                                "function": {"name": "", "arguments": ""},
                            }
                        if tc.id:
                            tool_call_buffers[idx]["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                tool_call_buffers[idx]["function"]["name"] = tc.function.name
                            if tc.function.arguments:
                                tool_call_buffers[idx]["function"]["arguments"] += tc.function.arguments

        except Exception as e:
            logger.error(f"LLM streaming error: {e}")
            yield _sse_event("error", {"message": str(e)})
            return

        total_input_tokens += input_tokens
        total_output_tokens += output_tokens

        # Finalize tool calls
        if tool_call_buffers:
            current_tool_calls = [tool_call_buffers[i] for i in sorted(tool_call_buffers.keys())]

        # If no tool calls, we're done
        if not current_tool_calls:
            assistant_content = current_content
            assistant_reasoning = current_reasoning
            break

        # Process tool calls
        # Add assistant message with tool calls to history
        assistant_msg: dict[str, Any] = {"role": "assistant", "tool_calls": current_tool_calls}
        if current_content:
            assistant_msg["content"] = current_content
        llm_messages.append(assistant_msg)
        all_tool_calls_raw.extend(current_tool_calls)

        for tc in current_tool_calls:
            func_name = tc["function"]["name"]
            try:
                args = json.loads(tc["function"]["arguments"])
            except json.JSONDecodeError:
                args = {}

            tool_call_id = tc["id"]
            yield _sse_event("tool_start", {"tool": func_name, "arguments": args, "tool_call_id": tool_call_id})

            tool_output = ""
            try:
                if func_name == "execute_code":
                    # Lazy sandbox creation
                    if sandbox is None:
                        yield _sse_event("tool_output", {"tool": func_name, "output": "Creating sandbox...", "tool_call_id": tool_call_id})
                        template = conversation.sandbox_template or "python-data-science"
                        sandbox = await sandbox_service.create_sandbox(template=template)
                        sandbox_id = sandbox.id
                        conversation.sandbox_id = sandbox_id
                        await db.flush()

                    result = await sandbox_service.execute_code(
                        sandbox,
                        args.get("language", "python"),
                        args.get("code", ""),
                    )
                    tool_output = result.stdout
                    if result.stderr:
                        tool_output += f"\n[stderr]: {result.stderr}"
                    if result.exit_code != 0:
                        tool_output += f"\n[exit_code]: {result.exit_code}"

                    yield _sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

                    # Check for new output files
                    new_files = await sandbox_service.check_output_files(sandbox, known_output_files)
                    for f in new_files:
                        known_output_files.add(f)
                        if f.lower().endswith((".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp")):
                            yield _sse_event("image_output", {"filename": f, "sandbox_id": sandbox_id})

                    # Detect tables
                    if result.stdout:
                        table = _detect_table(result.stdout)
                        if table:
                            yield _sse_event("table_output", {"rows": table})

                elif func_name == "write_file":
                    if sandbox is None:
                        template = conversation.sandbox_template or "python-data-science"
                        sandbox = await sandbox_service.create_sandbox(template=template)
                        sandbox_id = sandbox.id
                        conversation.sandbox_id = sandbox_id
                        await db.flush()

                    await sandbox_service.write_file(
                        sandbox, args.get("path", "/home/daytona/file.txt"), args.get("content", "")
                    )
                    tool_output = f"File written: {args.get('path', '')}"
                    yield _sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

                elif func_name == "read_file":
                    if sandbox is None:
                        tool_output = "Error: No sandbox available"
                    else:
                        content = await sandbox_service.read_file(sandbox, args.get("path", ""))
                        tool_output = content
                    yield _sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

                elif func_name == "list_files":
                    if sandbox is None:
                        tool_output = "Error: No sandbox available"
                    else:
                        files = await sandbox_service.list_files(sandbox, args.get("path", "/home/daytona"))
                        tool_output = "\n".join(files)
                    yield _sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

                elif func_name == "web_search":
                    results = await web_search(
                        args.get("query", ""),
                        args.get("num_results", 5),
                    )
                    tool_output = json.dumps(results, indent=2)
                    yield _sse_event("search_results", {"results": results, "tool_call_id": tool_call_id})
                    yield _sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

                elif func_name == "preview_app":
                    if sandbox is None:
                        tool_output = "Error: No sandbox available"
                    else:
                        port = args.get("port", 3000)
                        url = await sandbox_service.get_preview_url(sandbox, port)
                        tool_output = url
                        yield _sse_event("preview", {"url": url, "port": port})
                    yield _sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

                else:
                    tool_output = f"Unknown tool: {func_name}"
                    yield _sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

            except Exception as e:
                tool_output = f"Error executing {func_name}: {str(e)}"
                logger.error(f"Tool execution error: {e}")
                yield _sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

            yield _sse_event("tool_end", {"tool": func_name, "tool_call_id": tool_call_id})

            # Add tool result to message history
            llm_messages.append({
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": tool_output,
            })

        # Continue the loop - LLM will process tool results

    # Save assistant message
    assistant_msg_obj = Message(
        conversation_id=conversation_id,
        role="assistant",
        content=assistant_content,
        reasoning=assistant_reasoning or None,
        tool_calls=all_tool_calls_raw if all_tool_calls_raw else None,
        token_count=(total_input_tokens + total_output_tokens) if (total_input_tokens + total_output_tokens) > 0 else None,
        cost_usd=llm_service.calculate_cost(model, total_input_tokens, total_output_tokens) if total_input_tokens > 0 else None,
    )
    db.add(assistant_msg_obj)
    await db.flush()

    # Extract and save artifacts
    artifacts_data = extraction.extract_artifacts(assistant_content, all_tool_calls_raw)
    for art_data in artifacts_data:
        artifact = Artifact(
            conversation_id=conversation_id,
            message_id=assistant_msg_obj.id,
            type=art_data["type"],
            label=art_data["label"],
            content=art_data["content"],
            metadata_=art_data.get("metadata"),
        )
        db.add(artifact)

    # Log usage
    if total_input_tokens > 0 or total_output_tokens > 0:
        usage_log = UsageLog(
            user_id=conversation.user_id,
            conversation_id=conversation_id,
            model=model,
            input_tokens=total_input_tokens,
            output_tokens=total_output_tokens,
            cost_usd=llm_service.calculate_cost(model, total_input_tokens, total_output_tokens),
        )
        db.add(usage_log)

    await db.commit()

    # Generate title if this is the first exchange (existing_messages includes
    # the user message we just saved, so check for <= 1)
    if len(existing_messages) <= 1 and assistant_content and not conversation.title:
        try:
            title = await llm_service.generate_title(user_message, assistant_content)
            conversation.title = title
            await db.commit()
            logger.info(f"Generated title: {title}")
            yield _sse_event("title", {"title": title})
        except Exception as e:
            logger.error(f"Title generation failed: {e}")

    duration_ms = int((time.monotonic() - start_time) * 1000)

    yield _sse_event("done", {
        "message_id": str(assistant_msg_obj.id),
        "input_tokens": total_input_tokens,
        "output_tokens": total_output_tokens,
        "duration_ms": duration_ms,
        "artifacts": [
            {"id": str(a.id), "type": a.type, "label": a.label}
            for a in (await db.execute(
                select(Artifact).where(Artifact.message_id == assistant_msg_obj.id)
            )).scalars().all()
        ] if artifacts_data else [],
    })
