"""Artifact model: identity, lineage, versioning, and persistence.

Artifacts are the primary outputs of agent work — code, charts, tables,
documents, diagrams. This module formalizes how they're created, versioned,
and traced back to their source.
"""

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel


class ArtifactType(StrEnum):
    """Canonical artifact types."""

    CODE = "code"
    CHART = "chart"
    TABLE = "table"
    DOCUMENT = "document"
    DIAGRAM = "diagram"
    IMAGE = "image"
    FILE = "file"
    FORM = "form"  # For create_ui (future)
    REPORT = "report"  # For generated reports (future)


class ArtifactSource(StrEnum):
    """How the artifact was produced."""

    LLM_GENERATED = "llm_generated"  # Direct model output
    TOOL_OUTPUT = "tool_output"  # Result of tool execution
    SANDBOX_FILE = "sandbox_file"  # File created in sandbox
    USER_UPLOAD = "user_upload"  # Uploaded by user
    DERIVED = "derived"  # Derived from another artifact


class ArtifactLineage(BaseModel):
    """Tracks the provenance of an artifact."""

    source: ArtifactSource
    conversation_id: str | None = None
    message_id: str | None = None
    tool_call_id: str | None = None
    tool_name: str | None = None
    parent_artifact_id: str | None = None  # For derived artifacts
    model: str | None = None  # Which model generated it
    prompt_snippet: str | None = None  # First 200 chars of prompt that led to this


class ArtifactVersion(BaseModel):
    """A version of an artifact."""

    version: int
    content: Any
    metadata: dict[str, Any] = {}
    created_at: datetime | None = None
    change_summary: str | None = None  # What changed from previous version


class ArtifactEnvelope(BaseModel):
    """Complete artifact with lineage and versioning metadata.

    This is the canonical representation used for artifact center,
    lineage tracking, and export workflows.
    """

    id: str
    type: ArtifactType
    label: str
    lineage: ArtifactLineage
    current_version: int = 1
    versions: list[ArtifactVersion] = []
    pinned: bool = False
    tags: list[str] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        extra = "allow"


def classify_artifact_type(content: Any, label: str = "", tool_name: str = "") -> ArtifactType:
    """Infer artifact type from content, label, or producing tool."""
    if tool_name == "create_chart":
        return ArtifactType.CHART
    if tool_name == "run_sql":
        return ArtifactType.TABLE
    if tool_name == "create_ui":
        return ArtifactType.FORM

    label_lower = label.lower()
    if any(ext in label_lower for ext in [".py", ".js", ".ts", ".jsx", ".tsx", ".go", ".rs", ".java", ".css", ".html"]):
        return ArtifactType.CODE
    if any(ext in label_lower for ext in [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]):
        return ArtifactType.IMAGE
    if any(ext in label_lower for ext in [".csv", ".xlsx", ".parquet"]):
        return ArtifactType.TABLE
    if any(ext in label_lower for ext in [".md", ".txt", ".pdf", ".doc"]):
        return ArtifactType.DOCUMENT
    if "diagram" in label_lower or "mermaid" in label_lower:
        return ArtifactType.DIAGRAM

    if (
        isinstance(content, str)
        and len(content) > 0
        and (content.strip().startswith("{") or content.strip().startswith("```"))
    ):
        return ArtifactType.CODE

    return ArtifactType.DOCUMENT
