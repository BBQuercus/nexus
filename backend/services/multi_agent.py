"""Multi-agent orchestration for Nexus.

Supports running multiple agents in parallel on different aspects of a task,
scoring results, and letting users adopt or merge outcomes.
"""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum

from backend.logging_config import get_logger

logger = get_logger("multi_agent")


class AgentStrategy(StrEnum):
    PARALLEL = "parallel"      # Run all agents simultaneously
    SEQUENTIAL = "sequential"  # Run one after another
    BEST_OF_N = "best_of_n"    # Run N, pick best
    DEBATE = "debate"          # Agents critique each other's outputs


@dataclass
class AgentRun:
    """A single agent execution within a multi-agent workflow."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    model: str = ""
    persona_id: str | None = None
    status: str = "pending"  # pending, running, completed, failed
    result: str | None = None
    tokens_used: int = 0
    cost_usd: float = 0.0
    duration_ms: float = 0.0
    score: float | None = None  # Quality score (0-1)
    started_at: datetime | None = None
    completed_at: datetime | None = None


@dataclass
class MultiAgentWorkflow:
    """A multi-agent workflow orchestration."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    strategy: AgentStrategy = AgentStrategy.PARALLEL
    prompt: str = ""
    runs: list[AgentRun] = field(default_factory=list)
    status: str = "pending"  # pending, running, completed
    selected_run_id: str | None = None  # Which run was adopted
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None


# In-memory workflow registry
_workflows: dict[str, MultiAgentWorkflow] = {}


async def create_workflow(
    strategy: AgentStrategy,
    prompt: str,
    models: list[str],
    persona_ids: list[str] | None = None,
) -> MultiAgentWorkflow:
    """Create a multi-agent workflow."""
    workflow = MultiAgentWorkflow(
        strategy=strategy,
        prompt=prompt,
        runs=[
            AgentRun(model=model, persona_id=pid)
            for model, pid in zip(models, persona_ids or ([None] * len(models)), strict=False)  # type: ignore[list-item]
        ],
    )
    _workflows[workflow.id] = workflow
    logger.info("workflow_created", workflow_id=workflow.id, strategy=strategy.value, agent_count=len(models))
    return workflow


def get_workflow(workflow_id: str) -> MultiAgentWorkflow | None:
    """Get a workflow by ID."""
    return _workflows.get(workflow_id)


async def score_runs(workflow_id: str, scores: dict[str, float]):
    """Score runs in a workflow (user or auto-scoring)."""
    workflow = _workflows.get(workflow_id)
    if not workflow:
        return
    for run in workflow.runs:
        if run.id in scores:
            run.score = scores[run.id]


async def adopt_run(workflow_id: str, run_id: str):
    """Mark a run as the adopted/selected result."""
    workflow = _workflows.get(workflow_id)
    if not workflow:
        return
    workflow.selected_run_id = run_id
    logger.info("run_adopted", workflow_id=workflow_id, run_id=run_id)


def compare_runs(workflow_id: str) -> dict:
    """Generate a comparison of runs in a workflow."""
    workflow = _workflows.get(workflow_id)
    if not workflow:
        return {}

    return {
        "workflow_id": workflow.id,
        "strategy": workflow.strategy.value,
        "runs": [
            {
                "id": run.id,
                "model": run.model,
                "status": run.status,
                "tokens": run.tokens_used,
                "cost": run.cost_usd,
                "duration_ms": run.duration_ms,
                "score": run.score,
                "result_length": len(run.result or ""),
                "selected": run.id == workflow.selected_run_id,
            }
            for run in workflow.runs
        ],
    }
