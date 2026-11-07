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

    # Shared secret the core API sends as a bearer token. Required outside development.
    ai_service_token: str = ""

    # ---- Models -------------------------------------------------------------------
    # OpenAI is the primary provider for answers and embeddings. DeepSeek (OpenAI-compatible)
    # answers when OpenAI is unavailable.
    openai_api_key: str = ""
    openai_chat_model: str = "gpt-6.1-sol"
    openai_embedding_model: str = "text-embedding-3-small"
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_chat_model: str = "deepseek-flash"
    # "openai" in normal operation; "fake" gives deterministic vectors for tests.
    embeddings_provider: str = "openai"
    llm_timeout_seconds: float = 30.0

    # ---- Object storage (S3-compatible) ---------------------------------------------
    s3_endpoint: str = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_bucket: str = "groundline-uploads"
    s3_access_key: str = "groundline"
    s3_secret_key: str = "groundline-dev-secret"

    # ---- Ingestion ------------------------------------------------------------------
    ingest_worker_enabled: bool = True
    ingest_max_attempts: int = 3
    # Website sources may not point at private networks unless explicitly allowed (tests).
    allow_private_urls: bool = False

    # ---- Retrieval ------------------------------------------------------------------
    retrieval_top_k: int = 6
    # Cosine similarity below which a chunk is not considered relevant.
    retrieval_min_score: float = 0.3


@lru_cache
def get_settings() -> Settings:
    return Settings()
