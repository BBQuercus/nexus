"""Tests for OTLP telemetry exporter configuration."""

import os
import unittest
from unittest.mock import patch

os.environ.setdefault("LITE_LLM_API_KEY", "test-key")
os.environ.setdefault("LITE_LLM_URL", "http://localhost:4000")
os.environ.setdefault("SERVER_SECRET", "test-secret-with-sufficient-length-123456")

from backend.telemetry import (
    _build_otlp_exporter,
    _normalize_http_endpoint,
    _normalize_otlp_protocol,
    _parse_otlp_headers,
)


class TestParseOtlpHeaders(unittest.TestCase):
    def test_parses_valid_headers(self):
        headers = _parse_otlp_headers("authorization=Bearer token,x-scope-orgid=tenant-a")
        self.assertEqual(
            headers,
            {"authorization": "Bearer token", "x-scope-orgid": "tenant-a"},
        )

    def test_skips_invalid_header_entries(self):
        headers = _parse_otlp_headers("valid=value,missing-separator,=missing-key,missing-value=")
        self.assertEqual(headers, {"valid": "value"})


class TestNormalizeOtlpProtocol(unittest.TestCase):
    def test_uses_explicit_http_protocol_alias(self):
        protocol = _normalize_otlp_protocol("http", "grpc://tempo.railway.internal:4317")
        self.assertEqual(protocol, "http/protobuf")

    def test_infers_http_when_endpoint_targets_trace_path(self):
        protocol = _normalize_otlp_protocol(None, "https://tempo.example.com/v1/traces")
        self.assertEqual(protocol, "http/protobuf")

    def test_defaults_to_grpc_otherwise(self):
        protocol = _normalize_otlp_protocol(None, "grpc://tempo.railway.internal:4317")
        self.assertEqual(protocol, "grpc")

    def test_rejects_unknown_protocol(self):
        with self.assertRaises(ValueError):
            _normalize_otlp_protocol("udp", "https://tempo.example.com")


class TestNormalizeHttpEndpoint(unittest.TestCase):
    def test_adds_default_trace_path(self):
        endpoint = _normalize_http_endpoint("https://tempo.example.com")
        self.assertEqual(endpoint, "https://tempo.example.com/v1/traces")

    def test_preserves_existing_trace_path(self):
        endpoint = _normalize_http_endpoint("https://tempo.example.com/custom/v1/traces")
        self.assertEqual(endpoint, "https://tempo.example.com/custom/v1/traces")

    def test_converts_grpc_scheme_for_http_export(self):
        endpoint = _normalize_http_endpoint("grpc://tempo.railway.internal:4318")
        self.assertEqual(endpoint, "http://tempo.railway.internal:4318/v1/traces")


class TestBuildOtlpExporter(unittest.TestCase):
    def test_uses_grpc_exporter_for_grpc_protocol(self):
        with patch("opentelemetry.exporter.otlp.proto.grpc.trace_exporter.OTLPSpanExporter") as exporter_cls:
            exporter = _build_otlp_exporter(
                endpoint="grpc://tempo.railway.internal:4317",
                protocol="grpc",
                headers={"x-scope-orgid": "nexus"},
            )

        exporter_cls.assert_called_once_with(
            endpoint="http://tempo.railway.internal:4317",
            headers={"x-scope-orgid": "nexus"},
            insecure=True,
        )
        self.assertIs(exporter, exporter_cls.return_value)

    def test_uses_http_exporter_for_http_protocol(self):
        with patch("opentelemetry.exporter.otlp.proto.http.trace_exporter.OTLPSpanExporter") as exporter_cls:
            exporter = _build_otlp_exporter(
                endpoint="https://tempo.example.com",
                protocol="http/protobuf",
                headers={"authorization": "Bearer token"},
            )

        exporter_cls.assert_called_once_with(
            endpoint="https://tempo.example.com/v1/traces",
            headers={"authorization": "Bearer token"},
        )
        self.assertIs(exporter, exporter_cls.return_value)

    def test_honors_explicit_insecure_override(self):
        with (
            patch.dict(os.environ, {"OTEL_EXPORTER_OTLP_INSECURE": "false"}, clear=False),
            patch("opentelemetry.exporter.otlp.proto.grpc.trace_exporter.OTLPSpanExporter") as exporter_cls,
        ):
            _build_otlp_exporter(
                endpoint="http://tempo.example.com:4317",
                protocol="grpc",
                headers=None,
            )

        exporter_cls.assert_called_once_with(
            endpoint="http://tempo.example.com:4317",
            headers=None,
            insecure=False,
        )
