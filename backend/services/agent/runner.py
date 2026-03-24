"""Main agent loop orchestrators."""

import asyncio
import json
import time
import uuid
from typing import Any, AsyncGenerator, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.logging_config import get_logger
from backend.models import Artifact, Conversation
from backend.prompts.system import build_system_prompt
from backend.prompts.tools import get_tools_for_mode
from backend.services import llm as llm_service
from backend.services import sandbox as sandbox_service

from .history import build_llm_messages, detect_knowledge, load_conversation_messages
from .stream_mapper import sse_event
from .tool_executor import ToolExecutionContext, execute_tool_call
from .usage import link_retrieval_logs, log_usage, save_artifacts, save_assistant_message

logger = get_logger("agent")


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

    # Load conversation messages
    existing_messages = await load_conversation_messages(db, conversation_id, leaf_message_id)

    # Load conversation
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conversation = conv_result.scalar_one()

    # Determine knowledge availability
    has_knowledge, knowledge_base_ids = await detect_knowledge(
        db, conversation, conversation_id, persona
    )

    # Get tools
    tools_enabled = None
    if persona and hasattr(persona, "tools_enabled"):
        tools_enabled = persona.tools_enabled
    tools = get_tools_for_mode(mode, tools_enabled, has_knowledge=has_knowledge)

    # Build message history for LLM
    system_prompt = build_system_prompt(mode, persona, has_knowledge=has_knowledge, tools=tools)
    llm_messages = build_llm_messages(existing_messages, system_prompt, user_message, leaf_message_id)

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

    # Create tool execution context
    ctx = ToolExecutionContext(
        conversation=conversation,
        conversation_id=conversation_id,
        db=db,
        sandbox=sandbox,
        sandbox_id=sandbox_id,
        known_output_files=known_output_files,
        knowledge_base_ids=knowledge_base_ids,
        has_knowledge=has_knowledge,
        user_message=user_message,
    )

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
                    yield sse_event("token", {"content": delta.content})

                # Reasoning (some models support this)
                if hasattr(delta, "reasoning_content") and delta.reasoning_content:
                    current_reasoning += delta.reasoning_content
                    yield sse_event("reasoning", {"content": delta.reasoning_content})

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
            yield sse_event("error", {"message": str(e)})
            return
        except Exception as e:
            logger.error("llm_stream_error", error=str(e), model=model, iteration=iteration)
            yield sse_event("error", {"message": f"An error occurred while generating a response: {e}"})
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
        assistant_msg: dict[str, Any] = {"role": "assistant", "tool_calls": current_tool_calls}
        if current_content:
            assistant_msg["content"] = current_content
        llm_messages.append(assistant_msg)
        all_tool_calls_raw.extend(current_tool_calls)

        for tc in current_tool_calls:
            async for event in execute_tool_call(tc, ctx):
                if not event.get("__set_output__"):
                    yield event

            # Add tool result to message history
            # The enriched_tool_calls list was updated by execute_tool_call
            last_enriched = ctx.enriched_tool_calls[-1] if ctx.enriched_tool_calls else None
            tool_call_id = tc["id"]
            tool_output = last_enriched["output"] if last_enriched else ""

            llm_messages.append({
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": tool_output,
            })

        # Continue the loop - LLM will process tool results

    # Save assistant message
    assistant_msg_obj = await save_assistant_message(
        db=db,
        conversation_id=conversation_id,
        assistant_content=assistant_content,
        assistant_reasoning=assistant_reasoning,
        enriched_tool_calls=ctx.enriched_tool_calls,
        collected_images=ctx.collected_images,
        collected_charts=ctx.collected_charts,
        collected_files=ctx.collected_files,
        rag_citations=ctx.rag_citations,
        total_input_tokens=total_input_tokens,
        total_output_tokens=total_output_tokens,
        model=model,
        leaf_message_id=leaf_message_id,
    )

    # Link retrieval logs
    await link_retrieval_logs(db, ctx.retrieval_log_ids, assistant_msg_obj.id)

    # Extract and save artifacts
    artifacts_data = await save_artifacts(
        db=db,
        conversation_id=conversation_id,
        message_id=assistant_msg_obj.id,
        assistant_content=assistant_content,
        all_tool_calls_raw=all_tool_calls_raw,
        runtime_artifacts=ctx.runtime_artifacts,
    )

    # Log usage
    await log_usage(db, conversation, conversation_id, model, total_input_tokens, total_output_tokens)

    await db.commit()

    duration_ms = int((time.monotonic() - start_time) * 1000)

    yield sse_event("done", {
        "message_id": str(assistant_msg_obj.id),
        "active_leaf_id": str(assistant_msg_obj.id),
        "input_tokens": total_input_tokens,
        "output_tokens": total_output_tokens,
        "duration_ms": duration_ms,
        "sandbox_id": ctx.sandbox_id,
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
    compare_models: Optional[list[str]] = None,
) -> AsyncGenerator[dict, None]:
    """Run N agent loops in parallel, yielding multiplexed SSE events tagged with branch_index."""
    from backend.db import async_session

    queue: asyncio.Queue = asyncio.Queue()
    message_ids: list[Optional[str]] = [None] * num_responses

    async def run_branch(branch_idx: int):
        branch_model = compare_models[branch_idx] if compare_models else model
        try:
            async with async_session() as branch_db:
                async for event in run_agent_loop(
                    conversation_id=conversation_id,
                    user_message=user_message,
                    model=branch_model,
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
            await queue.put(sse_event("error", {"message": str(e), "branch_index": branch_idx}))
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
    yield sse_event("all_done", {
        "message_ids": [mid for mid in message_ids if mid],
        "active_leaf_id": first_msg_id,
        "branch_count": num_responses,
    })
