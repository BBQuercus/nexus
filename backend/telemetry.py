"""Telemetry: OpenTelemetry tracing + Prometheus metrics for Nexus."""

import os
from contextlib import contextmanager

from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from prometheus_client import Counter, Gauge, Histogram, Info

# --- Resource ---
_resource = Resource.create({
    "service.name": "nexus-backend",
    "service.version": os.environ.get("RELEASE_VERSION", "dev"),
    "deployment.environment": os.environ.get("ENVIRONMENT", "development"),
})

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


def setup_telemetry(app=None, db_engine=None):
    """Initialize OpenTelemetry tracing and auto-instrumentation."""

    # Set app info
    app_info.info({
        "version": os.environ.get("RELEASE_VERSION", "dev"),
        "environment": os.environ.get("ENVIRONMENT", "development"),
    })

    # Configure tracer provider
    provider = TracerProvider(resource=_resource)

    # Use OTLP exporter if endpoint is configured, otherwise console
    otlp_endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if otlp_endpoint:
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
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
