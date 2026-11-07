"""Groundline AI service.

Owns the AI workloads that the core API delegates: document ingestion (text extraction,
chunking, embeddings), semantic retrieval over pgvector, and LLM/agent orchestration.
The core API stays the system of record and the only service the web app talks to.
"""

from fastapi import FastAPI

from groundline_ai import __version__
from groundline_ai.config import get_settings

app = FastAPI(title="Groundline AI", version=__version__)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__, "environment": get_settings().environment}
