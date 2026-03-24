"""Tests for backend.config — Settings validation, defaults, and required fields.

Covers: default values for optional settings, required fields raising on missing
env vars, and correct types for all settings.
"""

import os
import unittest
import unittest.mock

os.environ.setdefault("LITE_LLM_API_KEY", "test-key")
os.environ.setdefault("LITE_LLM_URL", "https://example.com")
os.environ.setdefault("SERVER_SECRET", "test-secret-with-sufficient-length-123456")

from pydantic import ValidationError

from backend.config import Settings, settings


class TestSettingsDefaults(unittest.TestCase):
    """Verifies that optional settings have correct default values."""

    def test_jwt_access_token_minutes_default(self):
        self.assertEqual(settings.JWT_ACCESS_TOKEN_MINUTES, 60)

    def test_jwt_refresh_token_days_default(self):
        self.assertEqual(settings.JWT_REFRESH_TOKEN_DAYS, 7)

    def test_jwt_encoding_algorithm_default(self):
        self.assertEqual(settings.JWT_ENCODING_ALGORITHM, "HS256")

    def test_database_url_default(self):
        # May be overridden by env var, but should be a non-empty string
        self.assertIsInstance(settings.DATABASE_URL, str)
        self.assertGreater(len(settings.DATABASE_URL), 0)

    def test_workos_redirect_uri_default(self):
        # Has a default of localhost
        self.assertIsInstance(settings.WORKOS_REDIRECT_URI, str)

    def test_port_default(self):
        self.assertEqual(settings.PORT, 8000)

    def test_auto_apply_db_schema_default(self):
        self.assertFalse(settings.AUTO_APPLY_DB_SCHEMA)

    def test_embedding_model_default(self):
        self.assertEqual(settings.EMBEDDING_MODEL, "text-embedding-3-small")

    def test_embedding_dimensions_default(self):
        self.assertEqual(settings.EMBEDDING_DIMENSIONS, 1536)

    def test_rag_chunk_size_default(self):
        self.assertEqual(settings.RAG_CHUNK_SIZE, 512)

    def test_rag_chunk_overlap_default(self):
        self.assertEqual(settings.RAG_CHUNK_OVERLAP, 50)

    def test_rag_max_document_tokens_default(self):
        self.assertEqual(settings.RAG_MAX_DOCUMENT_TOKENS, 500_000)

    def test_rag_confidence_threshold_default(self):
        self.assertAlmostEqual(settings.RAG_CONFIDENCE_THRESHOLD, 0.3)

    def test_azure_speech_location_default(self):
        self.assertEqual(settings.AZURE_SPEECH_LOCATION, "switzerlandnorth")

    def test_optional_string_fields_default_to_empty(self):
        """Optional API keys should default to empty strings."""
        self.assertIsInstance(settings.DAYTONA_API_KEY, str)
        self.assertIsInstance(settings.DAYTONA_API_URL, str)
        self.assertIsInstance(settings.WORKOS_API_KEY, str)
        self.assertIsInstance(settings.WORKOS_CLIENT_ID, str)
        self.assertIsInstance(settings.SERPAPI_API_KEY, str)
        self.assertIsInstance(settings.AZURE_SPEECH_KEY, str)
        self.assertIsInstance(settings.RERANK_MODEL, str)
        self.assertIsInstance(settings.COHERE_API_KEY, str)


class TestSettingsRequiredFields(unittest.TestCase):
    """Verifies that required fields raise ValidationError when missing.

    We must clear the relevant env vars because pydantic-settings reads them
    as a fallback even when constructing with explicit kwargs.
    """

    def test_missing_lite_llm_api_key_raises(self):
        """LITE_LLM_API_KEY is required and should raise if missing."""
        env_override = {k: v for k, v in os.environ.items()}
        env_override.pop("LITE_LLM_API_KEY", None)
        with unittest.mock.patch.dict(os.environ, env_override, clear=True):
            with self.assertRaises(ValidationError):
                Settings(
                    _env_file=None,
                    LITE_LLM_URL="http://localhost:4000",
                    SERVER_SECRET="secret",
                )

    def test_missing_lite_llm_url_raises(self):
        env_override = {k: v for k, v in os.environ.items()}
        env_override.pop("LITE_LLM_URL", None)
        with unittest.mock.patch.dict(os.environ, env_override, clear=True):
            with self.assertRaises(ValidationError):
                Settings(
                    _env_file=None,
                    LITE_LLM_API_KEY="key",
                    SERVER_SECRET="secret",
                )

    def test_missing_server_secret_raises(self):
        env_override = {k: v for k, v in os.environ.items()}
        env_override.pop("SERVER_SECRET", None)
        with unittest.mock.patch.dict(os.environ, env_override, clear=True):
            with self.assertRaises(ValidationError):
                Settings(
                    _env_file=None,
                    LITE_LLM_API_KEY="key",
                    LITE_LLM_URL="http://localhost:4000",
                )


class TestSettingsTypes(unittest.TestCase):
    """Verifies correct types on loaded settings."""

    def test_integer_fields(self):
        self.assertIsInstance(settings.JWT_ACCESS_TOKEN_MINUTES, int)
        self.assertIsInstance(settings.JWT_REFRESH_TOKEN_DAYS, int)
        self.assertIsInstance(settings.JWT_VALIDITY_DAYS, int)
        self.assertIsInstance(settings.PORT, int)
        self.assertIsInstance(settings.EMBEDDING_DIMENSIONS, int)
        self.assertIsInstance(settings.RAG_CHUNK_SIZE, int)

    def test_float_fields(self):
        self.assertIsInstance(settings.RAG_CONFIDENCE_THRESHOLD, float)

    def test_bool_fields(self):
        self.assertIsInstance(settings.AUTO_APPLY_DB_SCHEMA, bool)

    def test_string_fields(self):
        self.assertIsInstance(settings.LITE_LLM_API_KEY, str)
        self.assertIsInstance(settings.LITE_LLM_URL, str)
        self.assertIsInstance(settings.SERVER_SECRET, str)


if __name__ == "__main__":
    unittest.main()
