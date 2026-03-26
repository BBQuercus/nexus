from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), env_file_encoding="utf-8", extra="ignore")

    LITE_LLM_API_KEY: str
    LITE_LLM_URL: str

    DAYTONA_API_KEY: str = ""
    DAYTONA_API_URL: str = ""

    WORKOS_API_KEY: str = ""
    WORKOS_CLIENT_ID: str = ""
    WORKOS_REDIRECT_URI: str = "http://localhost:8000/auth/callback"
    WORKOS_ORG_ID: str = ""  # WorkOS Organization ID for SSO (e.g. Microsoft Entra ID)
    FRONTEND_URL: str = "http://localhost:5173"
    CORS_ORIGINS: str = ""

    DATABASE_URL: str = "postgresql+asyncpg://nexus:nexus@localhost:5432/nexus"
    PGVECTOR_DATABASE_URL: str = ""

    SERVER_SECRET: str
    ADMIN_API_TOKEN: str = ""
    ADMIN_API_USER_ID: str = ""

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

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    TEAMS_WEBHOOK_URL: str = ""

    ENVIRONMENT: str = "development"
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"
    COOKIE_DOMAIN: str = ""

    PORT: int = 8000
    AUTO_APPLY_DB_SCHEMA: bool = False

    @field_validator("DATABASE_URL", "PGVECTOR_DATABASE_URL", mode="before")
    @classmethod
    def normalize_postgres_driver(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        if value.startswith("postgresql+asyncpg://"):
            return value

        if value.startswith("postgres://"):
            return "postgresql+asyncpg://" + value[len("postgres://") :]

        if value.startswith("postgresql://"):
            return "postgresql+asyncpg://" + value[len("postgresql://") :]

        return value

    @property
    def vector_database_url(self) -> str:
        return self.PGVECTOR_DATABASE_URL or self.DATABASE_URL

    @property
    def cors_origins(self) -> list[str]:
        origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        if self.FRONTEND_URL and self.FRONTEND_URL not in origins:
            origins.append(self.FRONTEND_URL)
        for local_origin in ("http://localhost:5173", "http://localhost:3000"):
            if local_origin not in origins:
                origins.append(local_origin)
        return origins

    @property
    def cookie_domain(self) -> str | None:
        domain = (self.COOKIE_DOMAIN or "").strip()
        if not domain:
            return None

        # Railway-managed *.up.railway.app hosts should use host-only cookies.
        # Browsers may reject a broad public suffix style cookie domain there,
        # which breaks session persistence after the auth callback.
        normalized = domain.lstrip(".")
        if normalized == "up.railway.app" or normalized.endswith(".up.railway.app"):
            return None

        return domain

    @property
    def cookie_secure(self) -> bool:
        return self.COOKIE_SECURE or self.FRONTEND_URL.startswith("https://")


settings = Settings()  # type: ignore[call-arg]
