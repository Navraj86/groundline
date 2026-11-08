"""Groundline AI service.

Owns the AI workloads that the core API delegates: document ingestion (text extraction,
chunking, embeddings), semantic retrieval over pgvector, and LLM orchestration. The core
API stays the system of record and the only service the web app talks to.
"""

import asyncio
import hmac
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, status

from groundline_ai import __version__
from groundline_ai.agent import AgentRequest, AgentResponse, respond
from groundline_ai.answering import AnswerRequest, AnswerResponse, answer
from groundline_ai.config import get_settings
from groundline_ai.db import close_pool, open_pool
from groundline_ai.evaluation import (
    EvalCaseRequest,
    EvalCaseResult,
    Grade,
    GradeRequest,
    grade_answer,
    run_case,
)
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


def require_service_token(authorization: Annotated[str | None, Header()] = None) -> None:
    """Internal endpoints are called only by the core API, with a shared bearer token."""
    settings = get_settings()
    token = settings.ai_service_token
    if not token:
        if settings.environment == "production":
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE, "AI_SERVICE_TOKEN is not configured"
            )
        return
    expected = f"Bearer {token}"
    if not authorization or not hmac.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid service token")


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__, "environment": get_settings().environment}


@app.post("/v1/answer", tags=["answers"], dependencies=[Depends(require_service_token)])
async def create_answer(request: AnswerRequest) -> AnswerResponse:
    """Answers a customer question from the organization's knowledge base."""
    return await answer(request, get_settings())


@app.post("/v1/agent/respond", tags=["agent"], dependencies=[Depends(require_service_token)])
async def agent_respond(request: AgentRequest) -> AgentResponse:
    """One agent step: an answer, or tool calls for the core API to vet and run."""
    return await respond(request, get_settings())


@app.post("/v1/eval/grade", tags=["evaluation"], dependencies=[Depends(require_service_token)])
async def eval_grade(request: GradeRequest) -> Grade:
    """Scores a live answer's relevance and groundedness against the sources it cited."""
    return await grade_answer(request, get_settings())


@app.post("/v1/eval/case", tags=["evaluation"], dependencies=[Depends(require_service_token)])
async def eval_case(request: EvalCaseRequest) -> EvalCaseResult:
    """Answers one evaluation question and scores retrieval and answer quality."""
    return await run_case(request, get_settings())
