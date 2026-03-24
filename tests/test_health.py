"""Tests for health and readiness endpoints and their helper functions.

Covers: /health endpoint structure, /ready returning 503 when dependencies
are down, _check_db, _check_llm, _check_daytona, _configured_llm_models,
_extract_proxy_models.
"""

import os
import types
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("LITE_LLM_API_KEY", "test-key")
os.environ.setdefault("LITE_LLM_URL", "http://localhost:4000")
os.environ.setdefault("SERVER_SECRET", "test-secret-with-sufficient-length-123456")

from backend.main import (
    _check_daytona,
    _check_db,
    _check_llm,
    _configured_llm_models,
    _extract_proxy_models,
)


class TestCheckDb(unittest.IsolatedAsyncioTestCase):
    """Tests for the _check_db helper."""

    async def test_returns_ok_when_db_is_reachable(self):
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()

        mock_engine_connect = AsyncMock()
        mock_engine_connect.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_engine_connect.__aexit__ = AsyncMock(return_value=False)

        with patch("backend.main.engine") as mock_engine:
            mock_engine.connect.return_value = mock_engine_connect
            result = await _check_db()

        self.assertEqual(result["status"], "ok")

    async def test_returns_error_when_db_is_unreachable(self):
        mock_engine_connect = AsyncMock()
        mock_engine_connect.__aenter__ = AsyncMock(side_effect=Exception("connection refused"))
        mock_engine_connect.__aexit__ = AsyncMock(return_value=False)

        with patch("backend.main.engine") as mock_engine:
            mock_engine.connect.return_value = mock_engine_connect
            result = await _check_db()

        self.assertEqual(result["status"], "error")
        self.assertIn("connection refused", result["error"])


class TestCheckLlm(unittest.IsolatedAsyncioTestCase):
    """Tests for the _check_llm helper."""

    async def test_returns_ok_when_proxy_is_healthy(self):
        mock_health_resp = MagicMock()
        mock_health_resp.status_code = 200

        mock_models_resp = MagicMock()
        mock_models_resp.json.return_value = {"data": [{"id": "gpt-4"}]}

        async def fake_get(url, headers=None):
            if "health" in url:
                return mock_health_resp
            return mock_models_resp

        mock_client = AsyncMock()
        mock_client.get = fake_get
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with patch("backend.main._configured_llm_models", return_value=[]):
                result = await _check_llm()

        self.assertEqual(result["status"], "ok")

    async def test_returns_error_when_proxy_is_unreachable(self):
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=Exception("connect timeout"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await _check_llm()

        self.assertEqual(result["status"], "error")
        self.assertIn("connect timeout", result["error"])


class TestCheckDaytona(unittest.IsolatedAsyncioTestCase):
    """Tests for the _check_daytona helper."""

    async def test_returns_unconfigured_when_url_empty(self):
        with patch("backend.main.settings") as mock_settings:
            mock_settings.DAYTONA_API_URL = ""
            result = await _check_daytona()

        self.assertEqual(result["status"], "unconfigured")

    async def test_returns_ok_when_daytona_is_healthy(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("backend.main.settings") as mock_settings:
            mock_settings.DAYTONA_API_URL = "http://localhost:3000"
            mock_settings.DAYTONA_API_KEY = "test-key"
            with patch("httpx.AsyncClient", return_value=mock_client):
                result = await _check_daytona()

        self.assertEqual(result["status"], "ok")

    async def test_returns_degraded_on_500(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 500

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("backend.main.settings") as mock_settings:
            mock_settings.DAYTONA_API_URL = "http://localhost:3000"
            mock_settings.DAYTONA_API_KEY = "test-key"
            with patch("httpx.AsyncClient", return_value=mock_client):
                result = await _check_daytona()

        self.assertEqual(result["status"], "degraded")

    async def test_returns_error_on_exception(self):
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=Exception("network error"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("backend.main.settings") as mock_settings:
            mock_settings.DAYTONA_API_URL = "http://localhost:3000"
            mock_settings.DAYTONA_API_KEY = "test-key"
            with patch("httpx.AsyncClient", return_value=mock_client):
                result = await _check_daytona()

        self.assertEqual(result["status"], "error")
        self.assertIn("network error", result["error"])


class TestConfiguredLlmModels(unittest.TestCase):
    """Tests for _configured_llm_models helper."""

    def test_returns_models_from_env(self):
        with patch.dict(os.environ, {
            "LITELLM_MODEL_GPT4": "gpt-4",
            "LITELLM_MODEL_CLAUDE": "claude-3",
            "OTHER_VAR": "ignore",
        }, clear=False):
            models = _configured_llm_models()

        self.assertIn("gpt-4", models)
        self.assertIn("claude-3", models)
        self.assertNotIn("ignore", models)

    def test_returns_empty_when_no_models_configured(self):
        # Filter out any existing LITELLM_MODEL_ vars
        env = {k: v for k, v in os.environ.items() if not k.startswith("LITELLM_MODEL_")}
        with patch.dict(os.environ, env, clear=True):
            models = _configured_llm_models()
        self.assertEqual(models, [])

    def test_returns_sorted_list(self):
        with patch.dict(os.environ, {
            "LITELLM_MODEL_Z": "z-model",
            "LITELLM_MODEL_A": "a-model",
        }, clear=False):
            models = _configured_llm_models()

        # Should be sorted
        self.assertEqual(models, sorted(models))


class TestExtractProxyModels(unittest.TestCase):
    """Tests for _extract_proxy_models helper."""

    def test_extracts_model_ids_from_valid_payload(self):
        payload = {
            "data": [
                {"id": "gpt-4", "object": "model"},
                {"id": "claude-3", "object": "model"},
            ]
        }
        models = _extract_proxy_models(payload)
        self.assertIn("gpt-4", models)
        self.assertIn("claude-3", models)

    def test_returns_empty_for_invalid_payload(self):
        self.assertEqual(_extract_proxy_models(None), [])
        self.assertEqual(_extract_proxy_models("not a dict"), [])
        self.assertEqual(_extract_proxy_models({}), [])
        self.assertEqual(_extract_proxy_models({"data": "not a list"}), [])

    def test_skips_invalid_items(self):
        payload = {
            "data": [
                {"id": "valid-model"},
                "not-a-dict",
                {"no_id": True},
                {"id": ""},
                {"id": "  "},
            ]
        }
        models = _extract_proxy_models(payload)
        self.assertEqual(models, ["valid-model"])

    def test_deduplicates_models(self):
        payload = {
            "data": [
                {"id": "gpt-4"},
                {"id": "gpt-4"},
            ]
        }
        models = _extract_proxy_models(payload)
        self.assertEqual(models, ["gpt-4"])

    def test_returns_sorted(self):
        payload = {
            "data": [
                {"id": "z-model"},
                {"id": "a-model"},
            ]
        }
        models = _extract_proxy_models(payload)
        self.assertEqual(models, ["a-model", "z-model"])


class TestHealthEndpointIntegration(unittest.IsolatedAsyncioTestCase):
    """Integration-style tests for the /health endpoint via the app."""

    async def test_health_returns_proper_structure(self):
        with patch("backend.main._check_db", AsyncMock(return_value={"status": "ok"})):
            with patch("backend.main._check_llm", AsyncMock(return_value={"status": "ok"})):
                with patch("backend.main._check_daytona", AsyncMock(return_value={"status": "unconfigured"})):
                    from backend.main import health
                    result = await health()

        self.assertIn("status", result)
        self.assertIn("checks", result)
        self.assertIn("latency_ms", result)
        self.assertIn("db", result["checks"])
        self.assertIn("llm", result["checks"])
        self.assertIn("daytona", result["checks"])
        self.assertEqual(result["status"], "ok")

    async def test_health_returns_degraded_when_dependency_down(self):
        with patch("backend.main._check_db", AsyncMock(return_value={"status": "error", "error": "down"})):
            with patch("backend.main._check_llm", AsyncMock(return_value={"status": "ok"})):
                with patch("backend.main._check_daytona", AsyncMock(return_value={"status": "unconfigured"})):
                    from backend.main import health
                    result = await health()

        self.assertEqual(result["status"], "degraded")


class TestReadinessEndpoint(unittest.IsolatedAsyncioTestCase):
    """Tests for the /ready endpoint."""

    async def test_ready_returns_200_when_all_ok(self):
        with patch("backend.main._check_db", AsyncMock(return_value={"status": "ok"})):
            with patch("backend.main._check_llm", AsyncMock(return_value={"status": "ok"})):
                with patch("backend.main._check_daytona", AsyncMock(return_value={"status": "unconfigured"})):
                    from backend.main import readiness
                    result = await readiness()

        # When all OK, returns dict (not JSONResponse with 503)
        self.assertIsInstance(result, dict)
        self.assertEqual(result["status"], "ok")

    async def test_ready_returns_503_when_dependency_down(self):
        with patch("backend.main._check_db", AsyncMock(return_value={"status": "error", "error": "down"})):
            with patch("backend.main._check_llm", AsyncMock(return_value={"status": "ok"})):
                with patch("backend.main._check_daytona", AsyncMock(return_value={"status": "unconfigured"})):
                    from backend.main import readiness
                    result = await readiness()

        # Should be a JSONResponse with 503
        self.assertEqual(result.status_code, 503)


if __name__ == "__main__":
    unittest.main()
