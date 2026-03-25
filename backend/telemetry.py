"""Telemetry: OpenTelemetry tracing + Prometheus metrics for Nexus."""

import os
from collections.abc import Mapping
from contextlib import contextmanager
from urllib.parse import urlparse, urlunparse

from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from prometheus_client import Counter, Gauge, Histogram, Info

# --- Resource ---
_resource = Resource.create(
    {
        "service.name": "nexus-backend",
        "service.version": os.environ.get("RELEASE_VERSION", "dev"),
        "deployment.environment": os.environ.get("ENVIRONMENT", "development"),
    }
)

# --- Prometheus Metrics ---

# Request metrics
http_requests_total = Counter(
    "nexus_http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status_code"],
)
http_request_duration = Histogram(
    "nexus_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

# LLM metrics
llm_requests_total = Counter(
    "nexus_llm_requests_total",
    "Total LLM API calls",
    ["model", "status"],
)
llm_token_usage = Counter(
    "nexus_llm_tokens_total",
    "Total LLM tokens used",
    ["model", "direction"],  # direction: input/output
)
llm_request_duration = Histogram(
    "nexus_llm_request_duration_seconds",
    "LLM request duration",
    ["model"],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, 120.0],
)
llm_time_to_first_token = Histogram(
    "nexus_llm_time_to_first_token_seconds",
    "Time to first token from LLM",
    ["model"],
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0],
)

# Tool metrics
tool_executions_total = Counter(
    "nexus_tool_executions_total",
    "Total tool executions",
    ["tool_name", "status"],
)
tool_execution_duration = Histogram(
    "nexus_tool_execution_duration_seconds",
    "Tool execution duration",
    ["tool_name"],
    buckets=[0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0],
)

# Sandbox metrics
sandbox_operations_total = Counter(
    "nexus_sandbox_operations_total",
    "Sandbox operations",
    ["operation", "status"],  # operation: create/execute/delete
)
active_sandboxes = Gauge(
    "nexus_active_sandboxes",
    "Currently active sandboxes",
)

# RAG metrics
rag_queries_total = Counter(
    "nexus_rag_queries_total",
    "RAG retrieval queries",
    ["status"],
)
rag_query_duration = Histogram(
    "nexus_rag_query_duration_seconds",
    "RAG query duration",
    ["phase"],  # phase: embedding/search/rerank
)

# Streaming metrics
active_streams = Gauge(
    "nexus_active_streams",
    "Currently active SSE streams",
)
stream_duration = Histogram(
    "nexus_stream_duration_seconds",
    "SSE stream duration",
    buckets=[1.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0],
)

# WebSocket metrics
active_websockets = Gauge(
    "nexus_active_websockets",
    "Currently active WebSocket connections",
)

# Error metrics
errors_total = Counter(
    "nexus_errors_total",
    "Total errors by type",
    ["error_type", "component"],  # component: api/llm/sandbox/rag/ws
)

# App info
app_info = Info("nexus", "Nexus application info")


def _parse_bool(value: str | None, default: bool = False) -> bool:
    """Parse a boolean-like env var value."""
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_otlp_headers(raw_headers: str | None) -> dict[str, str] | None:
    """Parse OTLP headers from OTEL_EXPORTER_OTLP_HEADERS."""
    if not raw_headers:
        return None

    headers: dict[str, str] = {}
    for item in raw_headers.split(","):
        key, separator, value = item.partition("=")
        key = key.strip()
        value = value.strip()
        if not separator or not key or not value:
            continue
        headers[key] = value

    return headers or None


def _normalize_otlp_protocol(protocol: str | None, endpoint: str) -> str:
    """Resolve the OTLP transport from env or endpoint scheme."""
    if protocol:
        normalized = protocol.strip().lower().replace("-", "").replace("_", "").replace("/", "")
        aliases = {
            "grpc": "grpc",
            "http": "http/protobuf",
            "httpprotobuf": "http/protobuf",
        }
        if normalized in aliases:
            return aliases[normalized]
        raise ValueError(f"Unsupported OTLP protocol: {protocol}")

    parsed = urlparse(endpoint)
    if parsed.scheme == "grpc":
        return "grpc"
    return "http/protobuf" if parsed.path.endswith("/v1/traces") else "grpc"


def _normalize_grpc_endpoint(endpoint: str) -> tuple[str, bool]:
    """Normalize an OTLP gRPC endpoint and infer TLS usage."""
    parsed = urlparse(endpoint)
    if parsed.scheme == "grpc":
        return urlunparse(("http", parsed.netloc, parsed.path, "", "", "")), True
    if parsed.scheme == "http":
        return endpoint, True
    if parsed.scheme == "https":
        return endpoint, False
    return endpoint, False


def _normalize_http_endpoint(endpoint: str) -> str:
    """Normalize an OTLP HTTP traces endpoint."""
    parsed = urlparse(endpoint)
    if parsed.scheme in {"grpc", ""}:
        parsed = parsed._replace(scheme="http")

    path = parsed.path.rstrip("/")
    if not path or path == "/":
        path = "/v1/traces"
    elif not path.endswith("/v1/traces"):
        path = f"{path}/v1/traces"

    return urlunparse(parsed._replace(path=path))


def _build_otlp_exporter(endpoint: str, protocol: str | None, headers: Mapping[str, str] | None):
    """Build an OTLP trace exporter using gRPC or HTTP transport."""
    resolved_protocol = _normalize_otlp_protocol(protocol, endpoint)

    if resolved_protocol == "grpc":
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

        normalized_endpoint, inferred_insecure = _normalize_grpc_endpoint(endpoint)
        insecure = _parse_bool(os.environ.get("OTEL_EXPORTER_OTLP_INSECURE"), default=inferred_insecure)
        return OTLPSpanExporter(
            endpoint=normalized_endpoint,
            headers=headers,
            insecure=insecure,
        )

    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

    return OTLPSpanExporter(
        endpoint=_normalize_http_endpoint(endpoint),
        headers=headers,
    )


def setup_telemetry(app=None, db_engine=None):
    """Initialize OpenTelemetry tracing and auto-instrumentation."""

    # Set app info
    app_info.info(
        {
            "version": os.environ.get("RELEASE_VERSION", "dev"),
            "environment": os.environ.get("ENVIRONMENT", "development"),
        }
    )

    # Configure tracer provider
    provider = TracerProvider(resource=_resource)

    # Use OTLP exporter if endpoint is configured, otherwise console
    otlp_endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if otlp_endpoint:
        exporter = _build_otlp_exporter(
            endpoint=otlp_endpoint,
            protocol=os.environ.get("OTEL_EXPORTER_OTLP_PROTOCOL"),
            headers=_parse_otlp_headers(os.environ.get("OTEL_EXPORTER_OTLP_HEADERS")),
        )
        provider.add_span_processor(BatchSpanProcessor(exporter))
    elif os.environ.get("OTEL_CONSOLE_EXPORT"):
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))

    trace.set_tracer_provider(provider)

    # Auto-instrument FastAPI
    if app:
        FastAPIInstrumentor.instrument_app(
            app,
            excluded_urls="health,ready,metrics",
        )

    # Auto-instrument SQLAlchemy
    if db_engine and hasattr(db_engine, "sync_engine"):
        SQLAlchemyInstrumentor().instrument(engine=db_engine.sync_engine)

    # Auto-instrument httpx (for LLM and external API calls)
    HTTPXClientInstrumentor().instrument()


def get_tracer(name: str = "nexus") -> trace.Tracer:
    """Get a named tracer for manual span creation."""
    return trace.get_tracer(name)


@contextmanager
def trace_operation(name: str, attributes: dict | None = None):
    """Context manager for tracing an operation with a span."""
    tracer = get_tracer()
    with tracer.start_as_current_span(name, attributes=attributes or {}) as span:
        try:
            yield span
        except Exception as e:
            span.set_status(trace.StatusCode.ERROR, str(e))
            span.record_exception(e)
            raise
