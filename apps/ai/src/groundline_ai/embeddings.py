"""Embedding providers. OpenAI in normal operation; a deterministic fake for tests."""

import hashlib
import math
from typing import Protocol

from openai import AsyncOpenAI

from groundline_ai.config import Settings

EMBEDDING_DIMENSIONS = 1536
BATCH_SIZE = 96


class EmbeddingsUnavailable(Exception):
    """Raised when no embedding provider is configured."""


class Embedder(Protocol):
    model: str

    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class OpenAIEmbedder:
    def __init__(self, settings: Settings) -> None:
        if not settings.openai_api_key:
            raise EmbeddingsUnavailable(
                "Embeddings aren't configured. Set OPENAI_API_KEY for the AI service."
            )
        self.model = settings.openai_embedding_model
        self._client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=60, max_retries=3)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for start in range(0, len(texts), BATCH_SIZE):
            batch = texts[start : start + BATCH_SIZE]
            response = await self._client.embeddings.create(model=self.model, input=batch)
            vectors.extend(item.embedding for item in sorted(response.data, key=lambda d: d.index))
        return vectors


class FakeEmbedder:
    """Deterministic bag-of-words vectors: texts sharing words get similar vectors."""

    model = "fake-embedding"

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(t) for t in texts]

    @staticmethod
    def _vector(text: str) -> list[float]:
        vec = [0.0] * EMBEDDING_DIMENSIONS
        for word in text.lower().split():
            word = "".join(ch for ch in word if ch.isalnum())
            if len(word) < 3:
                continue
            slot = (
                int.from_bytes(hashlib.sha256(word.encode()).digest()[:4], "big")
                % EMBEDDING_DIMENSIONS
            )
            vec[slot] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]


def get_embedder(settings: Settings) -> Embedder:
    if settings.embeddings_provider == "fake":
        return FakeEmbedder()
    return OpenAIEmbedder(settings)
