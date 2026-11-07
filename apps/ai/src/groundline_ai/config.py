from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# The monorepo keeps one .env at the repository root.
_ROOT_ENV = Path(__file__).resolve().parents[4] / ".env"


class Settings(BaseSettings):
    """Configuration for the AI service, read from the environment."""

    model_config = SettingsConfigDict(env_file=(_ROOT_ENV, ".env"), extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql://postgres:postgres@localhost:54322/groundline"
    redis_url: str = "redis://localhost:6379"
    # Shared secret the core API uses to call this service. Required outside development.
    ai_service_token: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
