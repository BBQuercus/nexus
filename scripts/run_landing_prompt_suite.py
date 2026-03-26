#!/usr/bin/env python3
"""Live validation suite for landing-page prompts.

Runs each prompt against the Nexus backend, collects evidence from the SSE
stream, then asks an LLM judge to score the response quality.  Supports
parallel execution, multiple execution/judge model combinations, and produces
a rich terminal report plus a JSON artifact.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import Any

import httpx
from openai import OpenAI
from rich.console import Console
from rich.panel import Panel
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn, TimeElapsedColumn
from rich.table import Table
from rich.text import Text

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

DEFAULT_EXECUTION_MODEL = "azure_ai/claude-sonnet-4-5-swc"
DEFAULT_JUDGE_MODEL = "azure_ai/gpt-5.4-mini"
DEFAULT_IMAGE_MODEL = "gpt-image-1.5-swc"
CATALOG_PATH = Path(__file__).resolve().parents[1] / "frontend/lib/landing-prompts.json"
DEFAULT_AUTH_MODE = "auto"
STREAM_RETRIES = 2
DEFAULT_STREAM_TIMEOUT_SECONDS = 120.0
DEFAULT_PARALLEL_WORKERS = 4

console = Console()
print_lock = Lock()

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class BranchEvidence:
    branch_index: int
    content: str = ""
    reasoning: str = ""
    tool_calls: list[str] = field(default_factory=list)
    tool_call_count: int = 0
    chart_count: int = 0
    form_count: int = 0
    image_count: int = 0
    table_count: int = 0
    file_count: int = 0
    preview_urls: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    message_id: str | None = None
    completed: bool = False


@dataclass
class JudgeResult:
    passed: bool
    score: float
    reason: str
    expected_tools_seen: list[str]
    missing_requirements: list[str]
    raw_response: str


@dataclass
class PromptRunResult:
    prompt_id: str
    label: str
    endpoint: str
    execution_model: str
    judge_model: str
    image_model: str | None
    compare_models: list[str]
    conversation_id: str | None
    duration_ms: int
    judge_duration_ms: int
    evidence_checks: dict[str, bool]
    evidence_passed: bool
    judge: JudgeResult | None
    passed: bool
    branches: list[dict[str, Any]]
    artifacts: list[dict[str, Any]]
    messages: list[dict[str, Any]]
    errors: list[str]


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.environ.get("NEXUS_BASE_URL", "http://localhost:8000"))
    parser.add_argument("--bearer-token", default=os.environ.get("NEXUS_TEST_BEARER_TOKEN"))
    parser.add_argument("--admin-token", default=os.environ.get("NEXUS_ADMIN_API_TOKEN"))
    parser.add_argument(
        "--auth-mode",
        choices=["auto", "bearer", "password", "admin-token", "mint-jwt"],
        default=os.environ.get("NEXUS_AUTH_MODE", DEFAULT_AUTH_MODE),
    )
    parser.add_argument("--server-secret", default=os.environ.get("NEXUS_SERVER_SECRET"), help="SERVER_SECRET for minting JWTs directly")
    parser.add_argument("--user-id", default=os.environ.get("NEXUS_TEST_USER_ID"), help="User UUID for mint-jwt auth")
    parser.add_argument("--railway-auto-auth", action="store_true", help="Fetch SERVER_SECRET + ADMIN_API_USER_ID from Railway to mint a JWT")
    parser.add_argument("--email", default=os.environ.get("NEXUS_TEST_EMAIL"))
    parser.add_argument("--password", default=os.environ.get("NEXUS_TEST_PASSWORD"))
    parser.add_argument(
        "--register-if-needed",
        action="store_true",
        default=os.environ.get("NEXUS_TEST_REGISTER_IF_NEEDED", "").lower() in {"1", "true", "yes"},
    )
    parser.add_argument("--execution-model", default=os.environ.get("NEXUS_PROMPT_EXECUTION_MODEL", DEFAULT_EXECUTION_MODEL))
    parser.add_argument("--judge-model", default=os.environ.get("NEXUS_PROMPT_JUDGE_MODEL", DEFAULT_JUDGE_MODEL))
    parser.add_argument("--image-model", default=os.environ.get("NEXUS_PROMPT_IMAGE_MODEL", DEFAULT_IMAGE_MODEL))
    parser.add_argument("--execution-models", default=os.environ.get("NEXUS_PROMPT_EXECUTION_MODELS", ""))
    parser.add_argument("--judge-models", default=os.environ.get("NEXUS_PROMPT_JUDGE_MODELS", ""))
    parser.add_argument("--compare-models", default=os.environ.get("NEXUS_PROMPT_COMPARE_MODELS", ""))
    parser.add_argument("--include-prompts", default=os.environ.get("NEXUS_PROMPT_INCLUDE", ""))
    parser.add_argument("--output-path", default=os.environ.get("NEXUS_PROMPT_OUTPUT_PATH", "reports/landing-prompt-suite.json"))
    parser.add_argument("--judge-base-url", default=os.environ.get("NEXUS_JUDGE_BASE_URL"))
    parser.add_argument("--judge-api-key", default=os.environ.get("NEXUS_JUDGE_API_KEY"))
    parser.add_argument("--railway-environment", default=os.environ.get("NEXUS_RAILWAY_ENVIRONMENT", "production"))
    parser.add_argument("--railway-service", default=os.environ.get("NEXUS_RAILWAY_SERVICE", "backend"))
    parser.add_argument(
        "--stream-timeout-seconds",
        type=float,
        default=float(os.environ.get("NEXUS_PROMPT_STREAM_TIMEOUT_SECONDS", str(DEFAULT_STREAM_TIMEOUT_SECONDS))),
    )
    parser.add_argument("--fail-on-first-error", action="store_true")
    parser.add_argument("--timeout-seconds", type=float, default=float(os.environ.get("NEXUS_PROMPT_TIMEOUT_SECONDS", "300")))
    parser.add_argument(
        "--parallel",
        type=int,
        default=int(os.environ.get("NEXUS_PROMPT_PARALLEL", str(DEFAULT_PARALLEL_WORKERS))),
        help="Number of parallel workers (0 = sequential)",
    )
    parser.add_argument("--no-judge", action="store_true", help="Skip judge evaluation (evidence checks only)")
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def csv_arg(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def load_catalog() -> list[dict[str, Any]]:
    return json.loads(CATALOG_PATH.read_text())


def make_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def stateful_headers(client: httpx.Client) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    csrf_token = client.cookies.get("csrf_token")
    if csrf_token:
        headers["X-CSRF-Token"] = csrf_token
    return headers


def ensure_success(response: httpx.Response, context: str) -> None:
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(f"{context} failed: {exc.response.status_code} {exc.response.text}") from exc


# ---------------------------------------------------------------------------
# SSE parsing
# ---------------------------------------------------------------------------


def sse_events(response: httpx.Response) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    buffer = ""
    event_type = ""
    data_lines: list[str] = []

    for chunk in response.iter_text():
        buffer += chunk.replace("\r\n", "\n")
        while "\n" in buffer:
            line, buffer = buffer.split("\n", 1)
            if not line:
                if data_lines:
                    payload = "\n".join(data_lines)
                    try:
                        event = json.loads(payload)
                    except json.JSONDecodeError:
                        event = {"raw": payload}
                    event["type"] = event_type or event.get("type") or "unknown"
                    events.append(event)
                event_type = ""
                data_lines = []
                continue
            if line.startswith("event:"):
                event_type = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                data_lines.append(line.split(":", 1)[1].lstrip())

    if data_lines:
        payload = "\n".join(data_lines)
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            event = {"raw": payload}
        event["type"] = event_type or event.get("type") or "unknown"
        events.append(event)

    return events


def parse_sse_text(raw_text: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    buffer = raw_text.replace("\r\n", "\n")
    for raw_event in buffer.split("\n\n"):
        if not raw_event.strip():
            continue
        event_type = ""
        data_lines: list[str] = []
        for line in raw_event.split("\n"):
            if line.startswith("event:"):
                event_type = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                data_lines.append(line.split(":", 1)[1].lstrip())
        payload = "\n".join(data_lines).strip()
        if not payload:
            continue
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            event = {"raw": payload}
        event["type"] = event_type or event.get("type") or "unknown"
        events.append(event)
    return events


def curl_sse_events(
    base_url: str,
    conversation_id: str,
    headers: dict[str, str],
    body: dict[str, Any],
    stream_timeout_seconds: float,
) -> list[dict[str, Any]]:
    if not shutil.which("curl"):
        raise RuntimeError("curl is not available for SSE fallback")
    command = [
        "curl",
        "-sS",
        "-N",
        "--http1.1",
        "--max-time",
        str(int(stream_timeout_seconds)),
        "-X",
        "POST",
        f"{base_url}/api/conversations/{conversation_id}/messages",
    ]
    for key, value in headers.items():
        command.extend(["-H", f"{key}: {value}"])
    command.extend(["--data", json.dumps(body)])
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"curl SSE fallback failed: {result.stderr.strip() or result.stdout.strip()}")
    return parse_sse_text(result.stdout)


# ---------------------------------------------------------------------------
# Evidence collection
# ---------------------------------------------------------------------------


def collect_branch_evidence(events: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    branches: dict[int, BranchEvidence] = {}
    errors: list[str] = []

    def branch(branch_index: int) -> BranchEvidence:
        if branch_index not in branches:
            branches[branch_index] = BranchEvidence(branch_index=branch_index)
        return branches[branch_index]

    for event in events:
        branch_index = int(event.get("branch_index", 0) or 0)
        current = branch(branch_index)
        event_type = event.get("type")

        if event_type == "token":
            current.content += str(event.get("content", ""))
        elif event_type == "reasoning":
            current.reasoning += str(event.get("content", ""))
        elif event_type == "tool_start":
            current.tool_call_count += 1
            tool_name = str(event.get("tool", ""))
            if tool_name:
                current.tool_calls.append(tool_name)
        elif event_type == "chart_output":
            current.chart_count += 1
        elif event_type == "ui_form":
            current.form_count += 1
        elif event_type == "image_output":
            current.image_count += 1
        elif event_type == "table_output":
            current.table_count += 1
        elif event_type == "file_output":
            current.file_count += 1
        elif event_type == "preview":
            url = str(event.get("url", ""))
            if url:
                current.preview_urls.append(url)
        elif event_type == "done":
            current.completed = True
            current.message_id = event.get("message_id")
        elif event_type == "error":
            message = str(event.get("message", "Unknown SSE error"))
            current.errors.append(message)
            errors.append(message)

    return [asdict(branches[idx]) for idx in sorted(branches)], errors


def compact_branches_for_judge(branches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    compact: list[dict[str, Any]] = []
    for branch in branches:
        compact.append(
            {
                "branch_index": branch.get("branch_index"),
                "content_preview": str(branch.get("content", ""))[:2000],
                "reasoning_preview": str(branch.get("reasoning", ""))[:500],
                "tool_calls": branch.get("tool_calls", [])[:10],
                "tool_call_count": branch.get("tool_call_count", 0),
                "chart_count": branch.get("chart_count", 0),
                "form_count": branch.get("form_count", 0),
                "image_count": branch.get("image_count", 0),
                "table_count": branch.get("table_count", 0),
                "file_count": branch.get("file_count", 0),
                "preview_urls": branch.get("preview_urls", [])[:5],
                "errors": branch.get("errors", [])[:5],
                "completed": branch.get("completed", False),
            }
        )
    return compact


def compact_artifacts_for_judge(artifacts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    compact: list[dict[str, Any]] = []
    for artifact in artifacts[:20]:
        compact.append(
            {
                "id": artifact.get("id"),
                "type": artifact.get("type"),
                "label": artifact.get("label"),
                "content_preview": str(artifact.get("content", ""))[:500],
                "metadata": artifact.get("metadata"),
            }
        )
    return compact


def evaluate_required_evidence(
    required_evidence: list[str],
    branches: list[dict[str, Any]],
    artifacts: list[dict[str, Any]],
) -> dict[str, bool]:
    checks: dict[str, bool] = {}
    tool_names = {tool for branch in branches for tool in branch.get("tool_calls", [])}
    total_branch_count = len(branches)
    artifact_types = {artifact.get("type") for artifact in artifacts}
    total_charts = sum(int(branch.get("chart_count", 0)) for branch in branches)
    total_forms = sum(int(branch.get("form_count", 0)) for branch in branches)
    total_images = sum(int(branch.get("image_count", 0)) for branch in branches)
    completed_branches = sum(1 for branch in branches if branch.get("completed"))

    for requirement in required_evidence:
        if requirement.startswith("tool_call:"):
            checks[requirement] = requirement.split(":", 1)[1] in tool_names
        elif requirement == "chart_output_or_artifact":
            checks[requirement] = total_charts > 0 or "chart" in artifact_types
        elif requirement == "form_output":
            checks[requirement] = total_forms > 0 or "form" in artifact_types
        elif requirement == "multi_branch_completion":
            checks[requirement] = completed_branches >= 2 or total_branch_count >= 2
        elif requirement == "image_output":
            checks[requirement] = total_images > 0 or "image" in artifact_types
        else:
            checks[requirement] = False

    return checks


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


def authenticate_password(
    client: httpx.Client,
    base_url: str,
    email: str,
    password: str,
    register_if_needed: bool,
    timeout_seconds: float,
) -> None:
    login_response = client.post(
        f"{base_url}/auth/password",
        json={"email": email, "password": password},
        headers={"Content-Type": "application/json"},
        timeout=timeout_seconds,
    )
    if login_response.is_success:
        return

    if register_if_needed and login_response.status_code == 401:
        register_response = client.post(
            f"{base_url}/auth/register",
            json={"email": email, "password": password, "name": email.split("@", 1)[0]},
            headers={"Content-Type": "application/json"},
            timeout=timeout_seconds,
        )
        ensure_success(register_response, f"register user {email}")
        return

    ensure_success(login_response, f"password login for {email}")


def mint_jwt(server_secret: str, user_id: str, algorithm: str = "HS256") -> str:
    """Mint a short-lived JWT for testing."""
    import jwt as pyjwt
    from datetime import timedelta

    payload = {
        "sub": user_id,
        "type": "access",
        "exp": datetime.now(UTC) + timedelta(hours=1),
        "iat": datetime.now(UTC),
    }
    return pyjwt.encode(payload, server_secret, algorithm=algorithm)


def resolve_railway_auth(args: argparse.Namespace) -> tuple[str, str]:
    """Fetch SERVER_SECRET + ADMIN_API_USER_ID from Railway and mint a JWT."""
    railway_vars = _load_railway_service_vars(args.railway_environment, args.railway_service)
    server_secret = args.server_secret or railway_vars.get("SERVER_SECRET")
    user_id = args.user_id or railway_vars.get("ADMIN_API_USER_ID")
    if not server_secret or not user_id:
        raise RuntimeError(
            "mint-jwt auth requires SERVER_SECRET + user-id. "
            "Provide via --server-secret/--user-id, env vars, or --railway-auto-auth with Railway CLI access."
        )
    return server_secret, user_id


def ensure_authenticated(
    client: httpx.Client,
    base_url: str,
    args: argparse.Namespace,
    timeout_seconds: float,
) -> dict[str, str]:
    auth_mode = args.auth_mode
    if auth_mode == "auto":
        if args.railway_auto_auth:
            auth_mode = "mint-jwt"
        elif args.server_secret and args.user_id:
            auth_mode = "mint-jwt"
        elif args.bearer_token:
            auth_mode = "bearer"
        elif args.admin_token:
            auth_mode = "admin-token"
        else:
            auth_mode = "password"

    if auth_mode == "bearer":
        if not args.bearer_token:
            raise RuntimeError("Bearer auth selected but no bearer token was provided")
        return make_headers(args.bearer_token)

    if auth_mode == "admin-token":
        if not args.admin_token:
            raise RuntimeError("Admin-token auth selected but no admin token was provided")
        return make_headers(args.admin_token)

    if auth_mode == "mint-jwt":
        server_secret, user_id = resolve_railway_auth(args)
        token = mint_jwt(server_secret, user_id)
        headers = make_headers(token)
        # Verify the minted JWT works
        me_response = client.get(
            f"{base_url}/auth/me",
            headers={k: v for k, v in headers.items() if k.lower() == "authorization"},
            timeout=timeout_seconds,
        )
        ensure_success(me_response, "verify minted JWT")
        return headers

    if not args.email or not args.password:
        raise RuntimeError("Password auth requires --email and --password (or NEXUS_TEST_EMAIL / NEXUS_TEST_PASSWORD)")

    authenticate_password(
        client=client,
        base_url=base_url,
        email=args.email,
        password=args.password,
        register_if_needed=args.register_if_needed,
        timeout_seconds=timeout_seconds,
    )
    me_response = client.get(f"{base_url}/auth/me", timeout=timeout_seconds)
    ensure_success(me_response, "verify authenticated session")
    return stateful_headers(client)


# ---------------------------------------------------------------------------
# Railway helpers
# ---------------------------------------------------------------------------


def _load_railway_service_vars(environment: str, service: str) -> dict[str, str]:
    if not shutil.which("railway"):
        return {}
    try:
        output = subprocess.check_output(
            ["railway", "variable", "list", "-e", environment, "-s", service, "--json"],
            text=True,
        )
    except Exception:
        return {}
    try:
        data = json.loads(output)
    except json.JSONDecodeError:
        return {}
    return {str(key): str(value) for key, value in data.items()}


def make_openai_client(args: argparse.Namespace) -> OpenAI:
    base_url = args.judge_base_url or os.environ.get("LITE_LLM_URL")
    api_key = args.judge_api_key or os.environ.get("LITE_LLM_API_KEY")
    if not base_url or not api_key:
        railway_vars = _load_railway_service_vars(args.railway_environment, args.railway_service)
        base_url = base_url or railway_vars.get("LITE_LLM_URL")
        api_key = api_key or railway_vars.get("LITE_LLM_API_KEY")
    if not base_url or not api_key:
        raise RuntimeError(
            "Judge calls require LITE_LLM_URL and LITE_LLM_API_KEY, "
            "or --judge-base-url/--judge-api-key, or Railway CLI access to the target backend service vars"
        )
    if not base_url.endswith("/"):
        base_url += "/"
    return OpenAI(base_url=f"{base_url}v1", api_key=api_key)


# ---------------------------------------------------------------------------
# Prompt execution
# ---------------------------------------------------------------------------


def extract_json_object(text: str) -> dict[str, Any]:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("Judge response did not contain JSON")
    return json.loads(text[start : end + 1])


def fetch_conversation_payload(
    client: httpx.Client,
    base_url: str,
    conversation_id: str,
    headers: dict[str, str],
    timeout_seconds: float,
    retries: int = 3,
) -> dict[str, Any]:
    auth_headers = {k: v for k, v in headers.items() if k.lower() == "authorization"}
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            conversation = client.get(
                f"{base_url}/api/conversations/{conversation_id}",
                headers=auth_headers,
                timeout=timeout_seconds,
            )
            ensure_success(conversation, f"fetch conversation {conversation_id}")

            artifacts = client.get(
                f"{base_url}/api/conversations/{conversation_id}/artifacts",
                headers=auth_headers,
                timeout=timeout_seconds,
            )
            ensure_success(artifacts, f"fetch artifacts for {conversation_id}")

            return {
                "conversation": conversation.json(),
                "artifacts": artifacts.json(),
            }
        except Exception as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(2 * attempt)
    raise last_error  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Knowledge base E2E helpers
# ---------------------------------------------------------------------------


def setup_knowledge_base(
    client: httpx.Client,
    base_url: str,
    headers: dict[str, str],
    document_content: str,
    document_filename: str,
    timeout_seconds: float,
) -> tuple[str, str]:
    """Create a KB, upload a test document, wait for ingestion. Returns (kb_id, doc_id)."""
    # Create KB
    kb_resp = client.post(
        f"{base_url}/api/knowledge-bases",
        headers=headers,
        json={
            "name": f"landing-prompt-test-{int(time.time())}",
            "description": "Ephemeral KB for landing prompt suite",
            "chunk_strategy": "basic",
            "is_public": False,
        },
        timeout=timeout_seconds,
    )
    ensure_success(kb_resp, "create test knowledge base")
    kb_id = kb_resp.json()["id"]

    # Upload document as multipart form
    upload_headers = {k: v for k, v in headers.items() if k.lower() != "content-type"}
    upload_resp = client.post(
        f"{base_url}/api/knowledge-bases/{kb_id}/documents",
        headers=upload_headers,
        files=[("files", (document_filename, document_content.encode(), "text/plain"))],
        timeout=timeout_seconds,
    )
    ensure_success(upload_resp, "upload test document")
    doc_id = upload_resp.json()["documents"][0]["id"]

    # Poll for ingestion completion (max 60s)
    deadline = time.time() + 60
    while time.time() < deadline:
        time.sleep(2)
        doc_resp = client.get(
            f"{base_url}/api/knowledge-bases/{kb_id}/documents",
            headers={k: v for k, v in headers.items() if k.lower() == "authorization"},
            timeout=timeout_seconds,
        )
        if doc_resp.is_success:
            docs = doc_resp.json()
            doc = next((d for d in docs if d["id"] == doc_id), None)
            if doc and doc.get("status") == "ready":
                return kb_id, doc_id
            if doc and doc.get("status") == "error":
                raise RuntimeError(f"Document ingestion failed: {doc.get('error_message', 'unknown')}")
    raise RuntimeError("Document ingestion timed out after 60s")


def teardown_knowledge_base(
    client: httpx.Client,
    base_url: str,
    headers: dict[str, str],
    kb_id: str,
    timeout_seconds: float,
) -> None:
    """Delete the test KB (cascades to documents and chunks)."""
    try:
        resp = client.delete(
            f"{base_url}/api/knowledge-bases/{kb_id}",
            headers=headers,
            timeout=timeout_seconds,
        )
        resp.raise_for_status()
    except Exception:
        pass  # Best-effort cleanup


def run_knowledge_base_prompt(
    client: httpx.Client,
    base_url: str,
    headers: dict[str, str],
    prompt_entry: dict[str, Any],
    execution_model: str,
    timeout_seconds: float,
    stream_timeout_seconds: float,
) -> tuple[str, list[dict[str, Any]], dict[str, Any], str]:
    """Full KB E2E: create KB, upload doc, chat with retrieval, return results + kb_id for cleanup."""
    doc_content = prompt_entry["test_document_content"]
    doc_filename = prompt_entry.get("test_document_filename", "test-doc.txt")

    kb_id, _doc_id = setup_knowledge_base(
        client, base_url, headers, doc_content, doc_filename, timeout_seconds,
    )

    try:
        # Create conversation linked to the KB
        conv_resp = client.post(
            f"{base_url}/api/conversations",
            headers=headers,
            json={
                "title": prompt_entry["label"],
                "model": execution_model,
                "knowledge_base_ids": [kb_id],
            },
            timeout=timeout_seconds,
        )
        ensure_success(conv_resp, f"create conversation for {prompt_entry['label']}")
        conversation_id = conv_resp.json()["id"]

        # Send the prompt with KB IDs attached
        body: dict[str, Any] = {
            "content": prompt_entry["prompt"],
            "model": execution_model,
            "knowledge_base_ids": [kb_id],
        }

        events: list[dict[str, Any]] = []
        last_error: Exception | None = None
        for attempt in range(1, STREAM_RETRIES + 1):
            try:
                with client.stream(
                    "POST",
                    f"{base_url}/api/conversations/{conversation_id}/messages",
                    headers=headers,
                    json=body,
                    timeout=httpx.Timeout(timeout_seconds, connect=min(30.0, timeout_seconds), read=stream_timeout_seconds),
                ) as stream_response:
                    ensure_success(stream_response, f"send prompt {prompt_entry['label']}")
                    events = sse_events(stream_response)
                last_error = None
                break
            except (httpx.RemoteProtocolError, httpx.ReadError, httpx.ReadTimeout) as exc:
                last_error = exc
                if attempt == STREAM_RETRIES:
                    raise RuntimeError(
                        f"stream prompt {prompt_entry['label']} failed after {STREAM_RETRIES} attempts: {exc}"
                    ) from exc
                if attempt == STREAM_RETRIES - 1:
                    events = curl_sse_events(base_url, conversation_id, headers, body, stream_timeout_seconds)
                    last_error = None
                    break
                time.sleep(2 * attempt)

        payload = fetch_conversation_payload(client, base_url, conversation_id, headers, timeout_seconds)

        if last_error is not None:
            messages = payload["conversation"].get("messages", [])
            if any((m.get("role") == "assistant" and str(m.get("content", "")).strip()) for m in messages):
                return conversation_id, events, payload, kb_id
            raise RuntimeError(f"stream prompt {prompt_entry['label']} failed: {last_error}")

        return conversation_id, events, payload, kb_id
    except Exception:
        teardown_knowledge_base(client, base_url, headers, kb_id, timeout_seconds)
        raise


def _stream_message(
    client: httpx.Client,
    base_url: str,
    headers: dict[str, str],
    conversation_id: str,
    body: dict[str, Any],
    label: str,
    timeout_seconds: float,
    stream_timeout_seconds: float,
) -> list[dict[str, Any]]:
    """Send a message and return SSE events. Shared helper for multi-step tests."""
    events: list[dict[str, Any]] = []
    for attempt in range(1, STREAM_RETRIES + 1):
        try:
            with client.stream(
                "POST",
                f"{base_url}/api/conversations/{conversation_id}/messages",
                headers=headers,
                json=body,
                timeout=httpx.Timeout(timeout_seconds, connect=min(30.0, timeout_seconds), read=stream_timeout_seconds),
            ) as stream_response:
                ensure_success(stream_response, f"send prompt {label}")
                events = sse_events(stream_response)
            return events
        except (httpx.RemoteProtocolError, httpx.ReadError, httpx.ReadTimeout) as exc:
            if attempt == STREAM_RETRIES:
                raise RuntimeError(f"stream {label} failed after {STREAM_RETRIES} attempts: {exc}") from exc
            if attempt == STREAM_RETRIES - 1:
                events = curl_sse_events(base_url, conversation_id, headers, body, stream_timeout_seconds)
                return events
            time.sleep(2 * attempt)
    return events


def run_multi_turn_prompt(
    client: httpx.Client,
    base_url: str,
    headers: dict[str, str],
    prompt_entry: dict[str, Any],
    execution_model: str,
    timeout_seconds: float,
    stream_timeout_seconds: float,
) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    """Send two messages in the same conversation and return the second turn's events."""
    # Create conversation
    conv_resp = client.post(
        f"{base_url}/api/conversations",
        headers=headers,
        json={"title": prompt_entry["label"], "model": execution_model},
        timeout=timeout_seconds,
    )
    ensure_success(conv_resp, f"create conversation for {prompt_entry['label']}")
    conversation_id = conv_resp.json()["id"]

    # Turn 1
    _stream_message(
        client, base_url, headers, conversation_id,
        {"content": prompt_entry["prompt"], "model": execution_model},
        f"{prompt_entry['label']} (turn 1)",
        timeout_seconds, stream_timeout_seconds,
    )

    # Turn 2 (follow-up)
    followup = prompt_entry["test_followup_prompt"]
    events = _stream_message(
        client, base_url, headers, conversation_id,
        {"content": followup, "model": execution_model},
        f"{prompt_entry['label']} (turn 2)",
        timeout_seconds, stream_timeout_seconds,
    )

    payload = fetch_conversation_payload(client, base_url, conversation_id, headers, timeout_seconds)
    return conversation_id, events, payload


def run_regenerate_prompt(
    client: httpx.Client,
    base_url: str,
    headers: dict[str, str],
    prompt_entry: dict[str, Any],
    execution_model: str,
    timeout_seconds: float,
    stream_timeout_seconds: float,
) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    """Send a message, then regenerate via SSE stream, return both responses for comparison."""
    # Create conversation
    conv_resp = client.post(
        f"{base_url}/api/conversations",
        headers=headers,
        json={"title": prompt_entry["label"], "model": execution_model},
        timeout=timeout_seconds,
    )
    ensure_success(conv_resp, f"create conversation for {prompt_entry['label']}")
    conversation_id = conv_resp.json()["id"]

    # Original message
    _stream_message(
        client, base_url, headers, conversation_id,
        {"content": prompt_entry["prompt"], "model": execution_model},
        f"{prompt_entry['label']} (original)",
        timeout_seconds, stream_timeout_seconds,
    )

    # Capture original assistant response
    payload_before = fetch_conversation_payload(client, base_url, conversation_id, headers, timeout_seconds)
    messages_before = payload_before["conversation"].get("messages", [])
    original_assistant = next((m for m in reversed(messages_before) if m.get("role") == "assistant"), None)
    if not original_assistant:
        raise RuntimeError("No assistant message to regenerate")
    original_content = str(original_assistant.get("content", ""))

    # Regenerate — this endpoint returns an SSE stream like send-message
    regen_url = f"{base_url}/api/conversations/{conversation_id}/messages/{original_assistant['id']}/regenerate"
    for attempt in range(1, STREAM_RETRIES + 1):
        try:
            with client.stream(
                "POST", regen_url,
                headers=headers,
                json={"model": execution_model},
                timeout=httpx.Timeout(timeout_seconds, connect=min(30.0, timeout_seconds), read=stream_timeout_seconds),
            ) as stream_response:
                ensure_success(stream_response, f"regenerate for {prompt_entry['label']}")
                sse_events(stream_response)  # consume the stream
            break
        except (httpx.RemoteProtocolError, httpx.ReadError, httpx.ReadTimeout) as exc:
            if attempt == STREAM_RETRIES:
                raise RuntimeError(f"regenerate stream failed: {exc}") from exc
            time.sleep(2 * attempt)

    # Re-fetch — active path now points to the new branch
    payload = fetch_conversation_payload(client, base_url, conversation_id, headers, timeout_seconds)
    messages_after = payload["conversation"].get("messages", [])
    regen_assistant = next((m for m in reversed(messages_after) if m.get("role") == "assistant"), None)
    regen_content = str(regen_assistant.get("content", "")) if regen_assistant else ""

    # Build synthetic events with both branches for judge comparison
    synthetic_events: list[dict[str, Any]] = [
        {"type": "token", "branch_index": 0, "content": original_content},
        {"type": "done", "branch_index": 0, "message_id": original_assistant.get("id")},
        {"type": "token", "branch_index": 1, "content": regen_content},
        {"type": "done", "branch_index": 1, "message_id": regen_assistant.get("id") if regen_assistant else None},
    ]

    # Merge both assistant messages into the payload for the judge
    payload["conversation"]["messages"] = messages_before + [
        m for m in messages_after if m.get("id") != original_assistant.get("id")
    ]

    return conversation_id, synthetic_events, payload


def generate_test_image_data_url() -> str:
    """Generate a small PNG with known text content for vision testing."""
    from PIL import Image, ImageDraw
    import base64
    import io

    img = Image.new("RGB", (400, 200), "white")
    draw = ImageDraw.Draw(img)
    draw.text((20, 30), "PROJECT NEXUS", fill="black")
    draw.text((20, 70), "Status: ACTIVE", fill="green")
    draw.text((20, 110), "Budget: $142,500", fill="black")
    draw.text((20, 150), "Team Lead: Dr. Elara Voss", fill="black")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


def run_image_attachment_prompt(
    client: httpx.Client,
    base_url: str,
    headers: dict[str, str],
    prompt_entry: dict[str, Any],
    execution_model: str,
    timeout_seconds: float,
    stream_timeout_seconds: float,
) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    """Send a message with an inline image attachment and verify the model reads it."""
    conv_resp = client.post(
        f"{base_url}/api/conversations",
        headers=headers,
        json={"title": prompt_entry["label"], "model": execution_model},
        timeout=timeout_seconds,
    )
    ensure_success(conv_resp, f"create conversation for {prompt_entry['label']}")
    conversation_id = conv_resp.json()["id"]

    data_url = generate_test_image_data_url()

    body: dict[str, Any] = {
        "content": prompt_entry["prompt"],
        "model": execution_model,
        "images": [{"filename": "project-dashboard.png", "data_url": data_url}],
    }

    events = _stream_message(
        client, base_url, headers, conversation_id,
        body, prompt_entry["label"],
        timeout_seconds, stream_timeout_seconds,
    )

    payload = fetch_conversation_payload(client, base_url, conversation_id, headers, timeout_seconds)
    return conversation_id, events, payload


def compare_models_for_prompt(prompt_entry: dict[str, Any], execution_model: str, override_models: list[str]) -> list[str]:
    if prompt_entry.get("id") != "multi-model-compare":
        return []
    if override_models:
        return override_models
    default_models = [str(model) for model in prompt_entry.get("default_compare_models", [])]
    if execution_model in default_models:
        return default_models
    if len(default_models) >= 2:
        return [execution_model, default_models[1]]
    return [execution_model]


def run_message_prompt(
    client: httpx.Client,
    base_url: str,
    headers: dict[str, str],
    prompt_entry: dict[str, Any],
    execution_model: str,
    compare_models: list[str],
    timeout_seconds: float,
    stream_timeout_seconds: float,
) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    response = client.post(
        f"{base_url}/api/conversations",
        headers=headers,
        json={"title": prompt_entry["label"], "model": execution_model},
        timeout=timeout_seconds,
    )
    ensure_success(response, f"create conversation for {prompt_entry['label']}")
    conversation_id = response.json()["id"]

    body: dict[str, Any] = {"content": prompt_entry["prompt"], "model": execution_model}
    if compare_models:
        body["compare_models"] = compare_models

    last_error: Exception | None = None
    events: list[dict[str, Any]] = []
    for attempt in range(1, STREAM_RETRIES + 1):
        try:
            with client.stream(
                "POST",
                f"{base_url}/api/conversations/{conversation_id}/messages",
                headers=headers,
                json=body,
                timeout=httpx.Timeout(timeout_seconds, connect=min(30.0, timeout_seconds), read=stream_timeout_seconds),
            ) as stream_response:
                ensure_success(stream_response, f"send prompt {prompt_entry['label']}")
                events = sse_events(stream_response)
            last_error = None
            break
        except (httpx.RemoteProtocolError, httpx.ReadError, httpx.ReadTimeout) as exc:
            last_error = exc
            if attempt == STREAM_RETRIES:
                raise RuntimeError(
                    f"stream prompt {prompt_entry['label']} failed after {STREAM_RETRIES} attempts: {exc}"
                ) from exc
            if attempt == STREAM_RETRIES - 1:
                events = curl_sse_events(base_url, conversation_id, headers, body, stream_timeout_seconds)
                last_error = None
                break
            time.sleep(2 * attempt)
    payload = fetch_conversation_payload(client, base_url, conversation_id, headers, timeout_seconds)

    if last_error is not None:
        messages = payload["conversation"].get("messages", [])
        if any((message.get("role") == "assistant" and str(message.get("content", "")).strip()) for message in messages):
            return conversation_id, events, payload
        raise RuntimeError(f"stream prompt {prompt_entry['label']} failed: {last_error}")

    return conversation_id, events, payload


def run_image_prompt(
    client: httpx.Client,
    base_url: str,
    headers: dict[str, str],
    prompt_entry: dict[str, Any],
    execution_model: str,
    image_model: str,
    timeout_seconds: float,
) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    response = client.post(
        f"{base_url}/api/conversations",
        headers=headers,
        json={"title": prompt_entry["label"], "model": execution_model},
        timeout=timeout_seconds,
    )
    ensure_success(response, f"create conversation for {prompt_entry['label']}")
    conversation_id = response.json()["id"]

    image_response = client.post(
        f"{base_url}/api/conversations/{conversation_id}/images",
        headers=headers,
        json={"prompt": prompt_entry["prompt"], "model": image_model},
        timeout=timeout_seconds,
    )
    ensure_success(image_response, f"generate image for {prompt_entry['label']}")
    image_payload = image_response.json()

    artifacts = client.get(
        f"{base_url}/api/conversations/{conversation_id}/artifacts",
        headers={k: v for k, v in headers.items() if k.lower() == "authorization"},
        timeout=timeout_seconds,
    )
    ensure_success(artifacts, f"fetch artifacts for {conversation_id}")

    synthetic_events = [
        {
            "type": "image_output",
            "branch_index": 0,
            "url": image_payload["assistant_message"]["images"][0]["url"],
        },
        {"type": "done", "branch_index": 0, "message_id": image_payload["assistant_message"]["id"]},
    ]

    return conversation_id, synthetic_events, {
        "conversation": {
            "messages": [
                image_payload["user_message"],
                image_payload["assistant_message"],
            ],
            "active_leaf_id": image_payload["active_leaf_id"],
        },
        "artifacts": artifacts.json(),
    }


# ---------------------------------------------------------------------------
# Judge
# ---------------------------------------------------------------------------


def judge_prompt_run(
    llm_client: OpenAI,
    prompt_entry: dict[str, Any],
    run_result: dict[str, Any],
    judge_model: str,
) -> JudgeResult:
    judge_payload = {
        "prompt_id": prompt_entry["id"],
        "label": prompt_entry["label"],
        "prompt": prompt_entry["prompt"],
        "expected_behaviors": prompt_entry["expected_behaviors"],
        "required_evidence": prompt_entry["required_evidence"],
        "judge_instructions": prompt_entry["judge_instructions"],
        "run_summary": run_result,
    }
    system_prompt = (
        "You are evaluating whether an AI assistant correctly handled a product smoke-test prompt. "
        "Return JSON only with keys: passed (bool), score (0.0-1.0), reason (string), "
        "expected_tools_seen (string array), missing_requirements (string array)."
    )

    response = llm_client.chat.completions.create(
        model=judge_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(judge_payload)},
        ],
        temperature=0,
    )
    raw = response.choices[0].message.content or ""
    parsed = extract_json_object(raw)
    return JudgeResult(
        passed=bool(parsed.get("passed")),
        score=float(parsed.get("score", 0.0)),
        reason=str(parsed.get("reason", "")),
        expected_tools_seen=[str(item) for item in parsed.get("expected_tools_seen", [])],
        missing_requirements=[str(item) for item in parsed.get("missing_requirements", [])],
        raw_response=raw,
    )


def judge_image_run(
    llm_client: OpenAI,
    prompt_entry: dict[str, Any],
    run_result: dict[str, Any],
    judge_model: str,
) -> JudgeResult:
    system_prompt = (
        "You are evaluating whether an image-generation result matches a prompt. "
        "Return JSON only with keys: passed (bool), score (0.0-1.0), reason (string), "
        "expected_tools_seen (string array), missing_requirements (string array)."
    )

    first_image = next((artifact.get("content") for artifact in run_result["artifacts"] if artifact.get("type") == "image"), None)
    if not first_image:
        return JudgeResult(
            passed=False,
            score=0.0,
            reason="No image artifact was returned",
            expected_tools_seen=[],
            missing_requirements=["image_output"],
            raw_response="",
        )

    response = llm_client.chat.completions.create(
        model=judge_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(
                            {
                                "prompt_id": prompt_entry["id"],
                                "prompt": prompt_entry["prompt"],
                                "judge_instructions": prompt_entry["judge_instructions"],
                                "required_evidence": prompt_entry["required_evidence"],
                            }
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": first_image}},
                ],
            },
        ],
        temperature=0,
    )
    raw = response.choices[0].message.content or ""
    parsed = extract_json_object(raw)
    return JudgeResult(
        passed=bool(parsed.get("passed")),
        score=float(parsed.get("score", 0.0)),
        reason=str(parsed.get("reason", "")),
        expected_tools_seen=[str(item) for item in parsed.get("expected_tools_seen", [])],
        missing_requirements=[str(item) for item in parsed.get("missing_requirements", [])],
        raw_response=raw,
    )


def summarise_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summary: list[dict[str, Any]] = []
    for message in messages[-6:]:
        # Strip tool call details to keep payload under judge context limits
        tool_calls = message.get("tool_calls") or []
        compact_tools = [
            {"name": tc.get("name") or tc.get("function", {}).get("name", "?")}
            for tc in tool_calls[:5]
        ]
        summary.append(
            {
                "id": message.get("id"),
                "role": message.get("role"),
                "model": message.get("model"),
                "content_preview": str(message.get("content", ""))[:800],
                "tool_calls": compact_tools,
                "images": len(message.get("images") or []),
                "charts": len(message.get("charts") or []),
            }
        )
    return summary


# ---------------------------------------------------------------------------
# Single prompt run (thread-safe unit of work)
# ---------------------------------------------------------------------------


def run_single_prompt(
    args: argparse.Namespace,
    base_url: str,
    base_headers: dict[str, str],
    prompt_entry: dict[str, Any],
    execution_model: str,
    judge_model: str,
    compare_models_override: list[str],
    llm_client: OpenAI | None,
) -> PromptRunResult:
    """Execute one prompt+model combination. Safe to call from a thread."""
    run_started = time.perf_counter()
    compare_models = compare_models_for_prompt(prompt_entry, execution_model, compare_models_override)

    kb_id_to_cleanup: str | None = None

    with httpx.Client(follow_redirects=True) as client:
        headers = dict(base_headers)
        try:
            test_type = prompt_entry.get("test_type")
            if test_type == "knowledge-base-e2e":
                conversation_id, events, payload, kb_id_to_cleanup = run_knowledge_base_prompt(
                    client, base_url, headers, prompt_entry,
                    execution_model, args.timeout_seconds, args.stream_timeout_seconds,
                )
            elif test_type == "multi-turn":
                conversation_id, events, payload = run_multi_turn_prompt(
                    client, base_url, headers, prompt_entry,
                    execution_model, args.timeout_seconds, args.stream_timeout_seconds,
                )
            elif test_type == "regenerate":
                conversation_id, events, payload = run_regenerate_prompt(
                    client, base_url, headers, prompt_entry,
                    execution_model, args.timeout_seconds, args.stream_timeout_seconds,
                )
            elif test_type == "image-attachment":
                conversation_id, events, payload = run_image_attachment_prompt(
                    client, base_url, headers, prompt_entry,
                    execution_model, args.timeout_seconds, args.stream_timeout_seconds,
                )
            elif prompt_entry["endpoint"] == "images":
                conversation_id, events, payload = run_image_prompt(
                    client, base_url, headers, prompt_entry,
                    execution_model, args.image_model, args.timeout_seconds,
                )
            else:
                conversation_id, events, payload = run_message_prompt(
                    client, base_url, headers, prompt_entry,
                    execution_model, compare_models,
                    args.timeout_seconds, args.stream_timeout_seconds,
                )

            branches, event_errors = collect_branch_evidence(events)
            messages = payload["conversation"].get("messages", [])
            artifacts = payload["artifacts"]
            checks = evaluate_required_evidence(prompt_entry["required_evidence"], branches, artifacts)

            # For KB E2E tests, verify expected facts appear in the response
            if prompt_entry.get("test_expected_facts"):
                response_text = " ".join(
                    str(b.get("content", "")) for b in branches
                ).lower()
                # Also check persisted messages in case SSE was incomplete
                for msg in messages:
                    if msg.get("role") == "assistant":
                        response_text += " " + str(msg.get("content", "") or msg.get("content_preview", "")).lower()
                for fact in prompt_entry["test_expected_facts"]:
                    key = f"fact:{fact}"
                    checks[key] = fact.lower() in response_text

            evidence_passed = all(checks.values()) if checks else True

            judge_result: JudgeResult | None = None
            judge_duration_ms = 0
            if llm_client and not args.no_judge:
                judge_started = time.perf_counter()
                judge_input = {
                    "conversation_id": conversation_id,
                    "execution_model": execution_model,
                    "endpoint": prompt_entry["endpoint"],
                    "compare_models": compare_models,
                    "branches": compact_branches_for_judge(branches),
                    "artifacts": compact_artifacts_for_judge(artifacts),
                    "messages": summarise_messages(messages),
                    "evidence_checks": checks,
                }
                if prompt_entry["endpoint"] == "images":
                    # Pass full artifacts so judge_image_run can access the
                    # complete base64 data URI for vision-based evaluation.
                    judge_input["artifacts"] = artifacts
                    judge_result = judge_image_run(llm_client, prompt_entry, judge_input, judge_model)
                else:
                    judge_result = judge_prompt_run(llm_client, prompt_entry, judge_input, judge_model)
                judge_duration_ms = int((time.perf_counter() - judge_started) * 1000)

            # SSE transport errors (chunked encoding, read timeouts) are
            # infrastructure noise — don't auto-fail when judge+evidence pass.
            has_quality_failure = not evidence_passed
            if judge_result is not None:
                has_quality_failure = has_quality_failure or not judge_result.passed
            passed = not has_quality_failure

            return PromptRunResult(
                prompt_id=prompt_entry["id"],
                label=prompt_entry["label"],
                endpoint=prompt_entry["endpoint"],
                execution_model=execution_model,
                judge_model=judge_model,
                image_model=args.image_model if prompt_entry["endpoint"] == "images" else None,
                compare_models=compare_models,
                conversation_id=conversation_id,
                duration_ms=int((time.perf_counter() - run_started) * 1000),
                judge_duration_ms=judge_duration_ms,
                evidence_checks=checks,
                evidence_passed=evidence_passed,
                judge=judge_result,
                passed=passed,
                branches=branches,
                artifacts=artifacts,
                messages=summarise_messages(messages),
                errors=event_errors,
            )
        except Exception as exc:
            return PromptRunResult(
                prompt_id=prompt_entry["id"],
                label=prompt_entry["label"],
                endpoint=prompt_entry["endpoint"],
                execution_model=execution_model,
                judge_model=judge_model,
                image_model=args.image_model if prompt_entry["endpoint"] == "images" else None,
                compare_models=compare_models,
                conversation_id=None,
                duration_ms=int((time.perf_counter() - run_started) * 1000),
                judge_duration_ms=0,
                evidence_checks={},
                evidence_passed=False,
                judge=None,
                passed=False,
                branches=[],
                artifacts=[],
                messages=[],
                errors=[str(exc)],
            )
        finally:
            if kb_id_to_cleanup:
                teardown_knowledge_base(client, base_url, headers, kb_id_to_cleanup, args.timeout_seconds)


# ---------------------------------------------------------------------------
# Rich output
# ---------------------------------------------------------------------------


def score_color(score: float) -> str:
    if score >= 0.8:
        return "green"
    if score >= 0.5:
        return "yellow"
    return "red"


def status_badge(passed: bool) -> Text:
    if passed:
        return Text(" PASS ", style="bold white on green")
    return Text(" FAIL ", style="bold white on red")


def render_results_table(results: list[PromptRunResult]) -> Table:
    table = Table(
        title="Landing Prompt Suite Results",
        show_lines=True,
        expand=True,
        title_style="bold cyan",
    )
    table.add_column("Status", width=8, justify="center")
    table.add_column("Prompt", min_width=18)
    table.add_column("Model", min_width=14)
    table.add_column("Evidence", width=10, justify="center")
    table.add_column("Judge", width=8, justify="center")
    table.add_column("Score", width=7, justify="center")
    table.add_column("Time", width=8, justify="right")
    table.add_column("Details", ratio=1, no_wrap=True, overflow="ellipsis")

    for result in results:
        status = status_badge(result.passed)

        # Evidence column
        if result.evidence_checks:
            ev_pass = sum(1 for v in result.evidence_checks.values() if v)
            ev_total = len(result.evidence_checks)
            ev_text = Text(f"{ev_pass}/{ev_total}", style="green" if ev_pass == ev_total else "red")
        else:
            ev_text = Text("n/a", style="dim")

        # Judge column
        if result.judge is not None:
            judge_text = Text(
                "PASS" if result.judge.passed else "FAIL",
                style="green" if result.judge.passed else "red",
            )
        else:
            judge_text = Text("skip", style="dim")

        # Score column
        if result.judge is not None:
            score_text = Text(f"{result.judge.score:.2f}", style=score_color(result.judge.score))
        else:
            score_text = Text("-", style="dim")

        # Time column
        total_s = result.duration_ms / 1000
        time_text = f"{total_s:.1f}s"

        # Details column — keep to one line
        detail = ""
        if result.errors:
            detail = f"[red]ERR: {result.errors[0][:60]}[/red]"
        elif result.judge is not None:
            detail = result.judge.reason[:80]
            if result.judge.missing_requirements:
                detail += f" [yellow](missing: {', '.join(result.judge.missing_requirements[:2])})[/yellow]"
        # Append compact branch stats
        stats: list[str] = []
        for b in result.branches[:2]:
            if b.get("tool_call_count"):
                stats.append(f"t={b['tool_call_count']}")
            if b.get("chart_count"):
                stats.append(f"ch={b['chart_count']}")
            if b.get("form_count"):
                stats.append(f"f={b['form_count']}")
            if b.get("image_count"):
                stats.append(f"img={b['image_count']}")
        if stats:
            detail += f" [dim]({', '.join(stats)})[/dim]"

        table.add_row(
            status,
            result.label,
            result.execution_model.split("/")[-1][:20],
            ev_text,
            judge_text,
            score_text,
            time_text,
            detail or "[dim]OK[/dim]",
        )

    return table


def render_summary_panel(results: list[PromptRunResult], wall_time_ms: int) -> Panel:
    total = len(results)
    passed = sum(1 for r in results if r.passed)
    failed = total - passed
    avg_score = 0.0
    scored = [r for r in results if r.judge is not None]
    if scored:
        avg_score = sum(r.judge.score for r in scored) / len(scored)  # type: ignore[union-attr]

    # Per-model breakdown
    by_model: dict[str, list[PromptRunResult]] = defaultdict(list)
    for r in results:
        short = r.execution_model.split("/")[-1]
        by_model[short].append(r)

    lines: list[str] = []
    lines.append(f"[bold]Total:[/bold] {total} runs  |  [green]{passed} passed[/green]  |  [red]{failed} failed[/red]")
    lines.append(f"[bold]Avg score:[/bold] [{score_color(avg_score)}]{avg_score:.2f}[/{score_color(avg_score)}]")
    lines.append(f"[bold]Wall time:[/bold] {wall_time_ms / 1000:.1f}s")

    if len(by_model) > 1:
        lines.append("")
        lines.append("[bold]By model:[/bold]")
        for model, model_results in sorted(by_model.items()):
            m_pass = sum(1 for r in model_results if r.passed)
            m_scores = [r.judge.score for r in model_results if r.judge]  # type: ignore[union-attr]
            m_avg = sum(m_scores) / len(m_scores) if m_scores else 0.0
            lines.append(
                f"  {model}: {m_pass}/{len(model_results)} passed, "
                f"avg score [{score_color(m_avg)}]{m_avg:.2f}[/{score_color(m_avg)}]"
            )

    # Per-prompt breakdown
    by_prompt: dict[str, list[PromptRunResult]] = defaultdict(list)
    for r in results:
        by_prompt[r.prompt_id].append(r)

    lines.append("")
    lines.append("[bold]By prompt:[/bold]")
    for prompt_id, prompt_results in sorted(by_prompt.items()):
        p_pass = sum(1 for r in prompt_results if r.passed)
        p_scores = [r.judge.score for r in prompt_results if r.judge]  # type: ignore[union-attr]
        p_avg = sum(p_scores) / len(p_scores) if p_scores else 0.0
        label = prompt_results[0].label
        status_icon = "[green]OK[/green]" if p_pass == len(prompt_results) else "[red]FAIL[/red]"
        lines.append(
            f"  {status_icon} {label}: {p_pass}/{len(prompt_results)} passed, "
            f"score [{score_color(p_avg)}]{p_avg:.2f}[/{score_color(p_avg)}]"
        )

    return Panel("\n".join(lines), title="Suite Summary", border_style="cyan", expand=True)


def build_json_report(
    results: list[PromptRunResult],
    args: argparse.Namespace,
    execution_models: list[str],
    judge_models: list[str],
    started_at: str,
    wall_time_ms: int,
) -> dict[str, Any]:
    by_model: dict[str, dict[str, int]] = defaultdict(lambda: {"passed": 0, "failed": 0})
    by_prompt: dict[str, dict[str, int]] = defaultdict(lambda: {"passed": 0, "failed": 0})

    for result in results:
        bucket = "passed" if result.passed else "failed"
        by_model[result.execution_model][bucket] += 1
        by_prompt[result.prompt_id][bucket] += 1

    scored = [r for r in results if r.judge is not None]
    avg_score = sum(r.judge.score for r in scored) / len(scored) if scored else 0.0  # type: ignore[union-attr]

    return {
        "started_at": started_at,
        "finished_at": datetime.now(UTC).isoformat(),
        "wall_time_ms": wall_time_ms,
        "config": {
            "base_url": args.base_url,
            "auth_mode": args.auth_mode,
            "execution_models": execution_models,
            "judge_models": judge_models,
            "image_model": args.image_model,
            "include_prompts": sorted(set(csv_arg(args.include_prompts))),
            "parallel_workers": args.parallel,
        },
        "summary": {
            "total_runs": len(results),
            "passed": sum(1 for r in results if r.passed),
            "failed": sum(1 for r in results if not r.passed),
            "average_score": round(avg_score, 3),
            "by_execution_model": dict(by_model),
            "by_prompt": dict(by_prompt),
        },
        "results": [asdict(item) for item in results],
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    args = parse_args()

    prompt_catalog = load_catalog()
    include_prompts = set(csv_arg(args.include_prompts))
    if include_prompts:
        prompt_catalog = [prompt for prompt in prompt_catalog if prompt["id"] in include_prompts]

    if not prompt_catalog:
        console.print("[red]No prompts to run (check --include-prompts filter)[/red]")
        return 2

    execution_models = csv_arg(args.execution_models) or [args.execution_model]
    judge_models = csv_arg(args.judge_models) or [args.judge_model]
    compare_models_override = csv_arg(args.compare_models)

    # Build work items: all (prompt, exec_model, judge_model) combinations
    work_items: list[tuple[dict[str, Any], str, str]] = []
    for execution_model in execution_models:
        for judge_model in judge_models:
            for prompt_entry in prompt_catalog:
                work_items.append((prompt_entry, execution_model, judge_model))

    console.print(
        Panel(
            f"[bold]{len(work_items)}[/bold] runs "
            f"([bold]{len(prompt_catalog)}[/bold] prompts x "
            f"[bold]{len(execution_models)}[/bold] exec models x "
            f"[bold]{len(judge_models)}[/bold] judge models)\n"
            f"Parallel workers: [bold]{args.parallel or 'sequential'}[/bold]",
            title="Landing Prompt Suite",
            border_style="cyan",
        )
    )

    # Authenticate once
    llm_client: OpenAI | None = None
    with httpx.Client(follow_redirects=True) as auth_client:
        try:
            base_url = args.base_url.rstrip("/")
            base_headers = ensure_authenticated(auth_client, base_url, args, args.timeout_seconds)
            console.print("[green]Authenticated successfully[/green]")
        except Exception as exc:
            console.print(f"[red]Authentication failed: {exc}[/red]")
            return 2

    if not args.no_judge:
        try:
            llm_client = make_openai_client(args)
            console.print("[green]Judge LLM client ready[/green]")
        except Exception as exc:
            console.print(f"[red]Judge client setup failed: {exc}[/red]")
            return 2

    started_at = datetime.now(UTC).isoformat()
    wall_start = time.perf_counter()
    output_path = Path(args.output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    results: list[PromptRunResult] = []

    workers = max(1, args.parallel) if args.parallel else 1

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        TimeElapsedColumn(),
        console=console,
        transient=False,
    ) as progress:
        task_id = progress.add_task("Running prompts", total=len(work_items))

        if workers <= 1:
            # Sequential execution
            for prompt_entry, execution_model, judge_model in work_items:
                progress.update(task_id, description=f"[cyan]{prompt_entry['label']}[/cyan] ({execution_model.split('/')[-1]})")
                result = run_single_prompt(
                    args, base_url, base_headers, prompt_entry,
                    execution_model, judge_model, compare_models_override, llm_client,
                )
                results.append(result)
                status = "[green]PASS[/green]" if result.passed else "[red]FAIL[/red]"
                progress.console.print(
                    f"  {status} {result.label} | {result.execution_model.split('/')[-1]} | {result.duration_ms}ms"
                )
                progress.advance(task_id)
                if args.fail_on_first_error and not result.passed:
                    break
        else:
            # Parallel execution
            future_to_item: dict[Any, tuple[dict[str, Any], str, str]] = {}
            with ThreadPoolExecutor(max_workers=workers) as executor:
                for prompt_entry, execution_model, judge_model in work_items:
                    future = executor.submit(
                        run_single_prompt,
                        args, base_url, base_headers, prompt_entry,
                        execution_model, judge_model, compare_models_override, llm_client,
                    )
                    future_to_item[future] = (prompt_entry, execution_model, judge_model)

                for future in as_completed(future_to_item):
                    prompt_entry, execution_model, judge_model = future_to_item[future]
                    try:
                        result = future.result()
                    except Exception as exc:
                        result = PromptRunResult(
                            prompt_id=prompt_entry["id"],
                            label=prompt_entry["label"],
                            endpoint=prompt_entry["endpoint"],
                            execution_model=execution_model,
                            judge_model=judge_model,
                            image_model=args.image_model if prompt_entry["endpoint"] == "images" else None,
                            compare_models=[],
                            conversation_id=None,
                            duration_ms=0,
                            judge_duration_ms=0,
                            evidence_checks={},
                            evidence_passed=False,
                            judge=None,
                            passed=False,
                            branches=[],
                            artifacts=[],
                            messages=[],
                            errors=[str(exc)],
                        )
                    results.append(result)
                    status = "[green]PASS[/green]" if result.passed else "[red]FAIL[/red]"
                    progress.console.print(
                        f"  {status} {result.label} | {result.execution_model.split('/')[-1]} | {result.duration_ms}ms"
                    )
                    progress.advance(task_id)

    wall_time_ms = int((time.perf_counter() - wall_start) * 1000)

    # Sort results by catalog order for display
    prompt_order = {p["id"]: i for i, p in enumerate(prompt_catalog)}
    results.sort(key=lambda r: (prompt_order.get(r.prompt_id, 999), r.execution_model, r.judge_model))

    # Render rich output
    console.print()
    console.print(render_results_table(results))
    console.print()
    console.print(render_summary_panel(results, wall_time_ms))

    # Write JSON report
    report = build_json_report(results, args, execution_models, judge_models, started_at, wall_time_ms)
    output_path.write_text(json.dumps(report, indent=2))
    console.print(f"\n[dim]Report written to {output_path}[/dim]")

    failed_count = sum(1 for r in results if not r.passed)
    return 0 if failed_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
