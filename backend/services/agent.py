import asyncio
import json
import time
import uuid
from typing import Any, AsyncGenerator, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.logging_config import get_logger
from backend.models import Artifact, Conversation, Message, UsageLog
from backend.prompts.system import build_system_prompt
from backend.prompts.tools import get_tools_for_mode
from backend.services import extraction
from backend.services import llm as llm_service
from backend.services import sandbox as sandbox_service
from backend.services.search import web_search

logger = get_logger("agent")


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
    leaf_message_id: Optional[uuid.UUID] = None,
) -> AsyncGenerator[dict, None]:
    """Run the agent loop, yielding SSE events.

    The loop: send messages to LLM, if tool_calls in response -> execute tools ->
    feed results back -> repeat until final text response.

    If leaf_message_id is provided, loads only messages on the path from root to
    that leaf (for branching support). The user message is already saved in the DB
    and included in the path.
    """
    start_time = time.monotonic()

    # Load conversation messages — either the active path or all messages
    if leaf_message_id:
        from sqlalchemy import text as sa_text
        path_result = await db.execute(
            sa_text("""
                WITH RECURSIVE path AS (
                    SELECT * FROM messages WHERE id = :leaf_id
                    UNION ALL
                    SELECT m.* FROM messages m JOIN path p ON m.id = p.parent_id
                )
                SELECT id FROM path
            """),
            {"leaf_id": str(leaf_message_id)},
        )
        path_ids = [row[0] for row in path_result.fetchall()]
        if path_ids:
            result = await db.execute(
                select(Message).where(Message.id.in_(path_ids)).order_by(Message.created_at)
            )
            existing_messages = list(result.scalars().all())
        else:
            existing_messages = []
    else:
        result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at)
        )
        existing_messages = list(result.scalars().all())

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

    # Only append user message if it's not already in the path
    # (when leaf_message_id is provided, the user message is already in the DB path)
    if not leaf_message_id:
        llm_messages.append({"role": "user", "content": user_message})

    # Get tools
    tools_enabled = None
    if persona and hasattr(persona, "tools_enabled"):
        tools_enabled = persona.tools_enabled
    tools = get_tools_for_mode(mode, tools_enabled)
    logger.info("agent_loop_start", mode=mode, model=model, tool_count=len(tools) if tools else 0, conversation_id=str(conversation_id))

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
    enriched_tool_calls: list[dict] = []
    collected_images: list[dict] = []

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

        except llm_service.LLMUnavailableError as e:
            logger.warning("llm_unavailable", model=model, iteration=iteration, error=str(e))
            yield _sse_event("error", {"message": str(e)})
            return
        except Exception as e:
            logger.error("llm_stream_error", error=str(e), model=model, iteration=iteration)
            yield _sse_event("error", {"message": f"An error occurred while generating a response: {e}"})
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
            tool_exit_code = 0
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

                    lang = args.get("language", "python")
                    code_len = len(args.get("code", ""))
                    logger.info("tool_execute_code", language=lang, code_chars=code_len)
                    result = await sandbox_service.execute_code(
                        sandbox,
                        lang,
                        args.get("code", ""),
                    )
                    logger.info("tool_execute_done", exit_code=result.exit_code, stdout_chars=len(result.stdout))
                    tool_output = result.stdout
                    if result.stderr:
                        tool_output += f"\n[stderr]: {result.stderr}"
                    tool_exit_code = result.exit_code
                    if result.exit_code != 0:
                        tool_output += f"\n[exit_code]: {result.exit_code}"

                    yield _sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

                    # Check for new output files
                    new_files = await sandbox_service.check_output_files(sandbox, known_output_files)
                    logger.info("output_files_check", new_files=list(new_files), known_count=len(known_output_files))
                    for f in new_files:
                        known_output_files.add(f)
                        if f.lower().endswith((".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp")):
                            # Read file and send as base64 data URL
                            try:
                                from backend.services.media import get_output_file
                                img_bytes = await get_output_file(sandbox, f)
                                import base64 as b64mod
                                img_b64 = b64mod.b64encode(img_bytes).decode("ascii")
                                ext = f.rsplit(".", 1)[-1].lower()
                                mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "svg": "image/svg+xml", "gif": "image/gif", "webp": "image/webp"}.get(ext, "image/png")
                                data_url = f"data:{mime};base64,{img_b64}"
                                yield _sse_event("image_output", {"filename": f, "url": data_url, "sandbox_id": sandbox_id})
                                collected_images.append({"filename": f, "url": data_url})
                            except Exception as img_err:
                                logger.error("image_read_failed", file=f, error=str(img_err))
                                yield _sse_event("image_output", {"filename": f, "sandbox_id": sandbox_id})
                        elif f.lower().endswith((".pptx", ".xlsx", ".pdf", ".docx", ".csv")):
                            # Emit file artifact event for downloadable files
                            yield _sse_event("file_output", {
                                "filename": f,
                                "sandbox_id": sandbox_id,
                                "file_type": f.rsplit(".", 1)[-1].lower(),
                            })

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
                tool_exit_code = 1
                logger.error("tool_execution_error", tool=func_name, error=str(e))
                yield _sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

            yield _sse_event("tool_end", {"tool": func_name, "tool_call_id": tool_call_id})

            # Build enriched tool call for persistence
            enriched_tool_calls.append({
                "id": tool_call_id,
                "name": func_name,
                "language": args.get("language", "") if func_name == "execute_code" else "",
                "code": args.get("code", "") if func_name == "execute_code" else "",
                "output": tool_output,
                "exitCode": tool_exit_code,
            })

            # Add tool result to message history
            llm_messages.append({
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": tool_output,
            })

        # Continue the loop - LLM will process tool results

    # Compute parent_id and branch_index for the assistant message
    assistant_parent_id = leaf_message_id  # parent is the user message (leaf of path)
    assistant_branch_index = 0
    if assistant_parent_id:
        sibling_result = await db.execute(
            select(func.count()).select_from(Message).where(Message.parent_id == assistant_parent_id)
        )
        assistant_branch_index = (sibling_result.scalar() or 0)

    # Save assistant message
    assistant_msg_obj = Message(
        conversation_id=conversation_id,
        role="assistant",
        content=assistant_content,
        reasoning=assistant_reasoning or None,
        tool_calls=enriched_tool_calls if enriched_tool_calls else None,
        images=collected_images if collected_images else None,
        token_count=(total_input_tokens + total_output_tokens) if (total_input_tokens + total_output_tokens) > 0 else None,
        cost_usd=llm_service.calculate_cost(model, total_input_tokens, total_output_tokens) if total_input_tokens > 0 else None,
        parent_id=assistant_parent_id,
        branch_index=assistant_branch_index,
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

    duration_ms = int((time.monotonic() - start_time) * 1000)

    yield _sse_event("done", {
        "message_id": str(assistant_msg_obj.id),
        "active_leaf_id": str(assistant_msg_obj.id),
        "input_tokens": total_input_tokens,
        "output_tokens": total_output_tokens,
        "duration_ms": duration_ms,
        "sandbox_id": sandbox_id,
        "artifacts": [
            {"id": str(a.id), "type": a.type, "label": a.label}
            for a in (await db.execute(
                select(Artifact).where(Artifact.message_id == assistant_msg_obj.id)
            )).scalars().all()
        ] if artifacts_data else [],
    })


async def run_multi_agent_loop(
    conversation_id: uuid.UUID,
    user_message: str,
    model: str,
    mode: str,
    persona: Optional[object],
    sandbox_id: Optional[str],
    leaf_message_id: uuid.UUID,
    num_responses: int,
) -> AsyncGenerator[dict, None]:
    """Run N agent loops in parallel, yielding multiplexed SSE events tagged with branch_index."""
    from backend.db import async_session

    queue: asyncio.Queue = asyncio.Queue()
    message_ids: list[Optional[str]] = [None] * num_responses

    async def run_branch(branch_idx: int):
        try:
            async with async_session() as branch_db:
                async for event in run_agent_loop(
                    conversation_id=conversation_id,
                    user_message=user_message,
                    model=model,
                    mode=mode,
                    persona=persona,
                    sandbox_id=sandbox_id,
                    db=branch_db,
                    leaf_message_id=leaf_message_id,
                ):
                    # Tag the event with branch_index
                    tagged = dict(event)
                    if "data" in tagged:
                        try:
                            data = json.loads(tagged["data"])
                            data["branch_index"] = branch_idx
                            tagged["data"] = json.dumps(data)
                        except (json.JSONDecodeError, TypeError):
                            pass
                    await queue.put(tagged)

                    # Capture message_id from done event
                    if tagged.get("event") == "done":
                        try:
                            data = json.loads(event.get("data", "{}"))
                            message_ids[branch_idx] = data.get("message_id")
                        except (json.JSONDecodeError, TypeError):
                            pass
        except Exception as e:
            logger.error("branch_error", branch_index=branch_idx, error=str(e))
            await queue.put(_sse_event("error", {"message": str(e), "branch_index": branch_idx}))
        finally:
            await queue.put(("BRANCH_DONE", branch_idx))

    tasks = [asyncio.create_task(run_branch(i)) for i in range(num_responses)]

    done_count = 0
    while done_count < num_responses:
        item = await queue.get()
        if isinstance(item, tuple) and item[0] == "BRANCH_DONE":
            done_count += 1
            continue
        yield item

    # Wait for all tasks to finish cleanly
    await asyncio.gather(*tasks, return_exceptions=True)

    # Emit all_done with collected message IDs
    first_msg_id = next((mid for mid in message_ids if mid), None)
    yield _sse_event("all_done", {
        "message_ids": [mid for mid in message_ids if mid],
        "active_leaf_id": first_msg_id,
        "branch_count": num_responses,
    })
