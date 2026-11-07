"""Groundline AI service.

Owns the AI workloads that the core API delegates: document ingestion (text extraction,
chunking, embeddings), semantic retrieval over pgvector, and LLM orchestration. The core
API stays the system of record and the only service the web app talks to.
"""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI

from groundline_ai import __version__
from groundline_ai.config import get_settings
from groundline_ai.db import close_pool, open_pool
from groundline_ai.ingestion.worker import run_worker
from groundline_ai.migrate import migrate

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    await migrate()
    await open_pool()
    stop = asyncio.Event()
    worker = asyncio.create_task(run_worker(stop)) if settings.ingest_worker_enabled else None
    try:
        yield
    finally:
        stop.set()
        if worker:
            worker.cancel()
            with suppress(asyncio.CancelledError):
                await worker
        await close_pool()


app = FastAPI(title="Groundline AI", version=__version__, lifespan=lifespan)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__, "environment": get_settings().environment}
