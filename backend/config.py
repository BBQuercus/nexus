from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE), env_file_encoding="utf-8", extra="ignore"
    )

    LITE_LLM_API_KEY: str
    LITE_LLM_URL: str

    DAYTONA_API_KEY: str = ""
    DAYTONA_API_URL: str = ""

    WORKOS_API_KEY: str = ""
    WORKOS_CLIENT_ID: str = ""
    WORKOS_REDIRECT_URI: str = "http://localhost:8000/auth/callback"

    DATABASE_URL: str = "postgresql+asyncpg://nexus:nexus@localhost:5432/nexus"

    SERVER_SECRET: str

    JWT_ENCODING_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_MINUTES: int = 60  # 1 hour access token
    JWT_REFRESH_TOKEN_DAYS: int = 7  # 7 day refresh token
    # Keep for backwards compat during migration
    JWT_VALIDITY_DAYS: int = 7

    SERPAPI_API_KEY: str = ""

    AZURE_SPEECH_KEY: str = ""
    AZURE_SPEECH_LOCATION: str = "switzerlandnorth"

    # RAG Configuration
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSIONS: int = 1536
    RERANK_MODEL: str = ""  # empty = disabled, e.g. "rerank-v3.5"
    COHERE_API_KEY: str = ""
    RAG_CHUNK_SIZE: int = 512  # tokens per chunk
    RAG_CHUNK_OVERLAP: int = 50
    RAG_MAX_DOCUMENT_TOKENS: int = 500_000
    RAG_CONFIDENCE_THRESHOLD: float = 0.3
    RAG_CONTEXTUAL_MODEL: str = "gpt-4.1-nano-swc"  # cheap model for context prefixes

    PORT: int = 8000


settings = Settings()
