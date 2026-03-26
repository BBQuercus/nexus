"""Tool call execution logic and tool result handling."""

import json
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from backend.logging_config import get_logger
from backend.models import RetrievalLog
from backend.services import sandbox as sandbox_service
from backend.services.chart_tool import normalize_chart_spec
from backend.services.search import web_search
from backend.services.sql_tool import build_run_sql_script
from backend.services.tables import detect_table, rows_to_csv
from backend.services.web import call_api, web_browse
from backend.telemetry import errors_total, tool_execution_duration, tool_executions_total
from backend.vector_db import vector_async_session

from .stream_mapper import sanitize_tool_arguments, sse_event

logger = get_logger("agent.tool_executor")


async def _run_knowledge_search(
    query: str,
    kb_ids: list[uuid.UUID],
    conversation_id: uuid.UUID | None,
):
    """Run RAG retrieval in its own DB session.

    This is a regular async function (not a generator) so it can safely
    use async-with session management without conflicting with the
    caller's async generator suspension points.
    """
    from backend.services.rag.retrieval import SearchScope, retrieve

    scope = SearchScope(
        knowledge_base_ids=kb_ids,
        conversation_id=conversation_id,
    )

    async with vector_async_session() as rag_db:
        result = await retrieve(
            db=rag_db,
            query=query,
            scope=scope,
            top_k=5,
        )
    return result


class ToolExecutionContext:
    """Mutable context passed through tool executions within a single agent loop."""

    def __init__(
        self,
        conversation,
        conversation_id: uuid.UUID,
        db: AsyncSession,
        sandbox=None,
        sandbox_id: str | None = None,
        known_output_files: set[str] | None = None,
        knowledge_base_ids: list[uuid.UUID] | None = None,
        has_knowledge: bool = False,
        user_message: str = "",
    ):
        self.conversation = conversation
        self.conversation_id = conversation_id
        self.db = db
        self.sandbox = sandbox
        self.sandbox_id = sandbox_id
        self.known_output_files = known_output_files or set()
        self.knowledge_base_ids = knowledge_base_ids or []
        self.has_knowledge = has_knowledge
        self.user_message = user_message

        # Collected outputs
        self.collected_images: list[dict] = []
        self.collected_files: list[dict] = []
        self.collected_charts: list[dict] = []
        self.runtime_artifacts: list[dict[str, Any]] = []
        self.rag_citations: list[dict] = []
        self.retrieval_log_ids: list[uuid.UUID] = []
        self.enriched_tool_calls: list[dict] = []


async def execute_tool_call(
    tc: dict,
    ctx: ToolExecutionContext,
) -> AsyncGenerator[dict, None]:
    """Execute a single tool call, yielding SSE events.

    Mutates ctx to track sandbox, files, artifacts, etc.
    """
    func_name = tc["function"]["name"]
    try:
        args = json.loads(tc["function"]["arguments"])
    except json.JSONDecodeError:
        args = {}

    tool_call_id = tc["id"]
    yield sse_event(
        "tool_start",
        {
            "tool": func_name,
            "arguments": sanitize_tool_arguments(func_name, args),
            "tool_call_id": tool_call_id,
        },
    )

    tool_output = ""
    tool_exit_code = 0
    tool_start_time = time.monotonic()
    try:
        if func_name == "execute_code":
            async for event in _execute_code(func_name, args, tool_call_id, ctx):
                if event.get("__set_output__"):
                    tool_output = event["output"]
                    tool_exit_code = event.get("exit_code", 0)
                else:
                    yield event

        elif func_name == "write_file":
            tool_output = await _write_file(args, ctx)
            yield sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

        elif func_name == "read_file":
            if ctx.sandbox is None:
                tool_output = "Error: No sandbox available"
            else:
                tool_output = await sandbox_service.read_file(ctx.sandbox, args.get("path", ""))
            yield sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

        elif func_name == "list_files":
            if ctx.sandbox is None:
                tool_output = "Error: No sandbox available"
            else:
                files = await sandbox_service.list_files(ctx.sandbox, args.get("path", "/home/daytona"))
                tool_output = "\n".join(files)
            yield sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

        elif func_name == "web_search":
            results = await web_search(
                args.get("query", ""),
                args.get("num_results", 5),
                engine=args.get("engine", "google"),
            )
            tool_output = json.dumps(results, indent=2)
            yield sse_event("search_results", {"results": results, "engine": args.get("engine", "google"), "tool_call_id": tool_call_id})
            yield sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

        elif func_name == "preview_app":
            if ctx.sandbox is None:
                tool_output = "Error: No sandbox available"
            else:
                port = args.get("port", 3000)
                url = await sandbox_service.get_preview_url(ctx.sandbox, port)
                tool_output = url
                yield sse_event("preview", {"url": url, "port": port, "sandbox_id": getattr(ctx.sandbox, "id", None)})
            yield sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

        elif func_name == "run_sql":
            async for event in _run_sql(func_name, args, tool_call_id, ctx):
                if event.get("__set_output__"):
                    tool_output = event["output"]
                    tool_exit_code = event.get("exit_code", 0)
                else:
                    yield event

        elif func_name == "create_chart":
            spec = normalize_chart_spec(args.get("spec"))
            title = args.get("title") or "Interactive Chart"
            yield sse_event("chart_output", {"spec": spec, "title": title})
            ctx.collected_charts.append({"spec": spec, "title": title})
            ctx.runtime_artifacts.append(
                {
                    "type": "chart",
                    "label": title,
                    "content": json.dumps(spec),
                    "metadata": {"title": title},
                }
            )
            tool_output = json.dumps({"title": title, "spec": spec}, indent=2)
            yield sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

        elif func_name == "call_api":
            result = await call_api(
                args.get("url", ""),
                method=args.get("method", "GET"),
                headers=args.get("headers"),
                body=args.get("body"),
                auth_type=args.get("auth_type", "none"),
                auth_value=args.get("auth_value"),
            )
            tool_output = json.dumps(result, indent=2)
            yield sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

        elif func_name == "web_browse":
            result = await web_browse(
                args.get("url", ""),
                extract_links=bool(args.get("extract_links", False)),
            )
            tool_output = json.dumps(result, indent=2)
            yield sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

        elif func_name == "create_ui":
            tool_output = _handle_create_ui(args, tool_call_id, ctx)
            yield sse_event(
                "ui_form",
                {
                    "title": args.get("title", "Form"),
                    "description": args.get("description", ""),
                    "fields": args.get("fields", []),
                    "submit_label": args.get("submit_label", "Submit"),
                    "allow_multiple": args.get("allow_multiple", False),
                    "tool_call_id": tool_call_id,
                },
            )
            yield sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

        elif func_name == "knowledge_search":
            async for event in _knowledge_search(func_name, args, tool_call_id, ctx):
                if event.get("__set_output__"):
                    tool_output = event["output"]
                else:
                    yield event

        else:
            tool_output = f"Unknown tool: {func_name}"
            yield sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

    except Exception as e:
        tool_output = f"Error executing {func_name}: {str(e)}"
        tool_exit_code = 1
        logger.error("tool_execution_error", tool=func_name, error=str(e))
        tool_executions_total.labels(tool_name=func_name, status="error").inc()
        errors_total.labels(error_type="tool_execution_error", component="api").inc()
        yield sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})
    else:
        tool_executions_total.labels(tool_name=func_name, status="success").inc()

    tool_execution_duration.labels(tool_name=func_name).observe(time.monotonic() - tool_start_time)
    yield sse_event("tool_end", {"tool": func_name, "tool_call_id": tool_call_id})

    # Build enriched tool call for persistence
    ctx.enriched_tool_calls.append(
        {
            "id": tool_call_id,
            "name": func_name,
            "language": args.get("language", "") if func_name == "execute_code" else "",
            "code": args.get("code", "") if func_name == "execute_code" else "",
            "output": tool_output,
            "exitCode": tool_exit_code,
        }
    )


async def _ensure_sandbox(ctx: ToolExecutionContext):
    """Lazily create a sandbox if needed."""
    if ctx.sandbox is None:
        template = ctx.conversation.sandbox_template or "python-data-science"
        ctx.sandbox = await sandbox_service.create_sandbox(
            template=template,
            labels={"user_id": str(ctx.conversation.user_id)},
        )
        ctx.sandbox_id = ctx.sandbox.id
        ctx.conversation.sandbox_id = ctx.sandbox_id
        await ctx.db.flush()


async def _execute_code(
    func_name: str, args: dict, tool_call_id: str, ctx: ToolExecutionContext
) -> AsyncGenerator[dict, None]:
    """Handle execute_code tool."""
    if ctx.sandbox is None:
        yield sse_event(
            "tool_output", {"tool": func_name, "output": "Creating sandbox...", "tool_call_id": tool_call_id}
        )
        await _ensure_sandbox(ctx)

    lang = args.get("language", "python")
    code_len = len(args.get("code", ""))
    logger.info("tool_execute_code", language=lang, code_chars=code_len)
    result = await sandbox_service.execute_code(
        ctx.sandbox,
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

    yield sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

    # Check for new output files
    new_files = await sandbox_service.check_output_files(ctx.sandbox, ctx.known_output_files)
    logger.info("output_files_check", new_files=list(new_files), known_count=len(ctx.known_output_files))
    for f in new_files:
        ctx.known_output_files.add(f)
        if f.lower().endswith((".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp")):
            try:
                from backend.services.media import get_output_file

                img_bytes = await get_output_file(ctx.sandbox, f)
                import base64 as b64mod

                img_b64 = b64mod.b64encode(img_bytes).decode("ascii")
                ext = f.rsplit(".", 1)[-1].lower()
                mime = {
                    "png": "image/png",
                    "jpg": "image/jpeg",
                    "jpeg": "image/jpeg",
                    "svg": "image/svg+xml",
                    "gif": "image/gif",
                    "webp": "image/webp",
                }.get(ext, "image/png")
                data_url = f"data:{mime};base64,{img_b64}"
                yield sse_event("image_output", {"filename": f, "url": data_url, "sandbox_id": ctx.sandbox_id})
                ctx.collected_images.append({"filename": f, "url": data_url})
                ctx.runtime_artifacts.append(
                    {
                        "type": "image",
                        "label": f,
                        "content": data_url,
                        "metadata": {"path": f, "mime_type": mime},
                    }
                )
            except Exception as img_err:
                logger.error("image_read_failed", file=f, error=str(img_err))
                yield sse_event("image_output", {"filename": f, "sandbox_id": ctx.sandbox_id})
        elif f.lower().endswith((".pptx", ".xlsx", ".pdf", ".docx", ".csv")):
            file_type = f.rsplit(".", 1)[-1].lower()
            yield sse_event(
                "file_output",
                {
                    "filename": f,
                    "sandbox_id": ctx.sandbox_id,
                    "file_type": file_type,
                },
            )
            ctx.collected_files.append(
                {
                    "filename": f,
                    "fileType": file_type,
                    "sandboxId": ctx.sandbox_id,
                }
            )
            ctx.runtime_artifacts.append(
                {
                    "type": "document",
                    "label": f,
                    "content": "",
                    "metadata": {"path": f, "file_type": file_type},
                }
            )

    # Detect tables
    if result.stdout:
        table = detect_table(result.stdout)
        if table:
            yield sse_event("table_output", {"rows": table})
            ctx.runtime_artifacts.append(
                {
                    "type": "table",
                    "label": "Query Results",
                    "content": rows_to_csv(table),
                    "metadata": {"rows": table},
                }
            )

    # Signal the output back via a special marker dict
    yield {"__set_output__": True, "output": tool_output, "exit_code": tool_exit_code}


async def _write_file(args: dict, ctx: ToolExecutionContext) -> str:
    """Handle write_file tool."""
    if ctx.sandbox is None:
        template = ctx.conversation.sandbox_template or "python-data-science"
        ctx.sandbox = await sandbox_service.create_sandbox(template=template)
        ctx.sandbox_id = ctx.sandbox.id
        ctx.conversation.sandbox_id = ctx.sandbox_id
        await ctx.db.flush()

    await sandbox_service.write_file(ctx.sandbox, args.get("path", "/home/daytona/file.txt"), args.get("content", ""))
    return f"File written: {args.get('path', '')}"


async def _run_sql(
    func_name: str, args: dict, tool_call_id: str, ctx: ToolExecutionContext
) -> AsyncGenerator[dict, None]:
    """Handle run_sql tool."""
    if ctx.sandbox is None:
        yield sse_event(
            "tool_output", {"tool": func_name, "output": "Creating sandbox...", "tool_call_id": tool_call_id}
        )
        template = ctx.conversation.sandbox_template or "python-data-science"
        ctx.sandbox = await sandbox_service.create_sandbox(template=template)
        ctx.sandbox_id = ctx.sandbox.id
        ctx.conversation.sandbox_id = ctx.sandbox_id
        await ctx.db.flush()

    sql_script = build_run_sql_script(
        args.get("sql", ""),
        args.get("output_format", "table"),
    )
    result = await sandbox_service.execute_code(ctx.sandbox, "python", sql_script)
    tool_output = result.stdout
    if result.stderr:
        tool_output += f"\n[stderr]: {result.stderr}"
    tool_exit_code = result.exit_code
    if result.exit_code != 0:
        tool_output += f"\n[exit_code]: {result.exit_code}"
    yield sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})

    if result.stdout and args.get("output_format", "table") == "table":
        table = detect_table(result.stdout)
        if table:
            yield sse_event("table_output", {"rows": table, "label": "SQL Results"})
            ctx.runtime_artifacts.append(
                {
                    "type": "table",
                    "label": "SQL Results",
                    "content": rows_to_csv(table),
                    "metadata": {"rows": table},
                }
            )

    yield {"__set_output__": True, "output": tool_output, "exit_code": tool_exit_code}


def _handle_create_ui(args: dict, tool_call_id: str, ctx: ToolExecutionContext) -> str:
    """Handle create_ui tool — validate form spec and save artifact."""
    title = args.get("title", "Form")
    fields = args.get("fields", [])

    # Basic validation
    if not isinstance(fields, list) or len(fields) == 0:
        return "Error: create_ui requires a non-empty 'fields' array"

    for i, field in enumerate(fields):
        if not isinstance(field, dict):
            return f"Error: field at index {i} is not an object"
        for key in ("id", "type", "label"):
            if key not in field:
                return f"Error: field at index {i} missing required key '{key}'"

    form_spec = {
        "title": title,
        "description": args.get("description", ""),
        "fields": fields,
        "submit_label": args.get("submit_label", "Submit"),
        "allow_multiple": args.get("allow_multiple", False),
    }

    ctx.runtime_artifacts.append(
        {
            "type": "form",
            "label": title,
            "content": json.dumps(form_spec),
            "metadata": {"tool_call_id": tool_call_id},
        }
    )

    return json.dumps({"status": "form_created", "title": title, "field_count": len(fields)})


async def _knowledge_search(
    func_name: str, args: dict, tool_call_id: str, ctx: ToolExecutionContext
) -> AsyncGenerator[dict, None]:
    """Handle knowledge_search tool."""
    from backend.services.rag.citations import (
        build_citations_json,
        build_retrieval_sse_event,
        format_retrieval_context,
    )

    _rag_sse_event = None
    try:
        search_kb_ids = list(ctx.knowledge_base_ids)
        if args.get("knowledge_base_ids"):
            requested_kb_ids = [uuid.UUID(kid) for kid in args["knowledge_base_ids"]]
            allowed_kb_ids = set(ctx.knowledge_base_ids)
            search_kb_ids = [kid for kid in requested_kb_ids if kid in allowed_kb_ids]

        if not search_kb_ids:
            raise ValueError("No selected knowledge base is available for this search")

        result = await _run_knowledge_search(
            query=args.get("query", ctx.user_message),
            kb_ids=search_kb_ids,
            conversation_id=ctx.conversation_id if ctx.has_knowledge else None,
        )

        context_text, confidence = format_retrieval_context(result)
        tool_output = context_text if context_text else "No relevant documents found."
        _rag_sse_event = build_retrieval_sse_event(result)

        async with vector_async_session() as vector_db:
            retrieval_log = RetrievalLog(
                org_id=ctx.conversation.org_id,
                query=args.get("query", ctx.user_message),
                chunks_retrieved=[
                    {
                        "chunk_id": str(c.id),
                        "document_id": str(c.document_id),
                        "score": round(c.score, 3),
                        "rerank_score": round(c.rerank_score, 3) if c.rerank_score else None,
                    }
                    for c in result.chunks
                ],
                total_candidates=result.total_candidates,
                retrieval_time_ms=result.retrieval_time_ms,
                rerank_time_ms=result.rerank_time_ms,
            )
            vector_db.add(retrieval_log)
            await vector_db.flush()
            ctx.retrieval_log_ids.append(retrieval_log.id)
            await vector_db.commit()

        ctx.rag_citations.extend(build_citations_json(result))

    except Exception as rag_err:
        logger.warning("knowledge_search_failed", error=str(rag_err), query=args.get("query", ""))
        errors_total.labels(error_type="knowledge_search_failed", component="rag").inc()
        tool_output = f"Knowledge search encountered an error: {rag_err}. Try rephrasing your query."

    if _rag_sse_event:
        yield sse_event("retrieval_results", _rag_sse_event)
    yield sse_event("tool_output", {"tool": func_name, "output": tool_output, "tool_call_id": tool_call_id})
    yield {"__set_output__": True, "output": tool_output}
