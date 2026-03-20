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
    JWT_VALIDITY_DAYS: int = 7

    SERPAPI_API_KEY: str = ""

    AZURE_SPEECH_KEY: str = ""
    AZURE_SPEECH_LOCATION: str = "switzerlandnorth"

    PORT: int = 8000


settings = Settings()
