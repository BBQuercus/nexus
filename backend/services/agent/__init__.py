"""Agent package — re-exports everything that was importable from backend.services.agent."""

from .runner import run_agent_loop, run_multi_agent_loop
from .stream_mapper import sanitize_tool_arguments as _sanitize_tool_arguments
from .stream_mapper import sse_event as _sse_event
from .tool_executor import _run_knowledge_search

# Backwards compatibility: expose the old private names at package level
_sse_event = _sse_event
_sanitize_tool_arguments = _sanitize_tool_arguments
_run_knowledge_search = _run_knowledge_search

__all__ = [
    "run_agent_loop",
    "run_multi_agent_loop",
    "_sse_event",
    "_sanitize_tool_arguments",
    "_run_knowledge_search",
]
