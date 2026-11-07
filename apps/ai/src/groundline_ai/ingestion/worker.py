"""Background ingestion worker.

Postgres is the job queue: the API inserts a knowledge source with status PENDING and
sends NOTIFY knowledge_ingest; the worker claims it with FOR UPDATE SKIP LOCKED, so any
number of workers can run safely. Polling backs up the notification channel, and a job
whose worker died is reclaimed after LOCK_TIMEOUT.
"""

import asyncio
import json
import logging
from dataclasses import dataclass

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from groundline_ai.config import Settings, get_settings
from groundline_ai.db import connection
from groundline_ai.embeddings import EmbeddingsUnavailable, get_embedder
from groundline_ai.ingestion.chunking import chunk_segments
from groundline_ai.ingestion.extract import Extracted, ExtractionError, extract_bytes, fetch_url
from groundline_ai.storage import read_object

log = logging.getLogger(__name__)

CHANNEL = "knowledge_ingest"
POLL_SECONDS = 15
LOCK_TIMEOUT = "10 minutes"
RETRY_BACKOFF = "30 seconds"
MAX_ERROR_LENGTH = 500


@dataclass
class Job:
    id: str
    organization_id: str
    type: str
    title: str
    file_key: str | None
    file_name: str | None
    mime_type: str | None
    url: str | None
    attempts: int


CLAIM_SQL = f"""
UPDATE knowledge_sources
   SET status = 'PROCESSING', locked_at = now(), attempts = attempts + 1, error = NULL, updated_at = now()
 WHERE id = (
       SELECT id FROM knowledge_sources
        WHERE (status = 'PENDING'
               AND (locked_at IS NULL OR locked_at < now() - attempts * interval '{RETRY_BACKOFF}'))
           OR (status = 'PROCESSING' AND locked_at < now() - interval '{LOCK_TIMEOUT}')
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1)
RETURNING id::text, organization_id::text, type::text, title, file_key, file_name, mime_type, url, attempts
"""


async def claim_job() -> Job | None:
    async with connection() as conn:
        row = await (await conn.execute(CLAIM_SQL)).fetchone()
    return Job(**row) if row else None


async def load_content(job: Job, settings: Settings) -> Extracted:
    if job.type == "URL":
        if not job.url:
            raise ExtractionError("The source has no URL.")
        return await fetch_url(job.url, allow_private=settings.allow_private_urls)
    if not job.file_key:
        raise ExtractionError("The source has no stored file.")
    data = await read_object(job.file_key)
    mime = "text/plain" if job.type == "TEXT" else job.mime_type
    return extract_bytes(data, mime, job.file_name)


async def process_job(job: Job, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    try:
        content = await load_content(job, settings)
        chunks = chunk_segments(content.segments)
        if not chunks:
            raise ExtractionError("No text found in this source.")
        embedder = get_embedder(settings)
        vectors = await embedder.embed([c.content for c in chunks])
    except (ExtractionError, EmbeddingsUnavailable) as err:
        await _finish_failed(job, str(err), permanent=True, settings=settings)
        return
    except Exception as err:  # network errors, provider outages, storage hiccups
        log.exception("Ingestion of %s failed", job.id)
        await _finish_failed(job, f"Temporary error: {err}", permanent=False, settings=settings)
        return

    async with connection() as conn, conn.transaction():
        # Swap old chunks for new ones atomically, so retrieval never sees a half-written source.
        await conn.execute("DELETE FROM ai.knowledge_chunks WHERE source_id = %s", (job.id,))
        async with conn.cursor() as cur:
            await cur.executemany(
                """INSERT INTO ai.knowledge_chunks
                       (organization_id, source_id, chunk_index, content, token_count, embedding, embedding_model, metadata)
                   VALUES (%s, %s, %s, %s, %s, %s::vector, %s, %s)""",
                [
                    (
                        job.organization_id,
                        job.id,
                        chunk.index,
                        chunk.content,
                        chunk.token_count,
                        str(vector),
                        embedder.model,
                        Jsonb({"pages": chunk.pages} if chunk.pages else {}),
                    )
                    for chunk, vector in zip(chunks, vectors, strict=True)
                ],
            )
        # Keep a user-supplied title; fill in the document's own title when we only had a URL or file name.
        await conn.execute(
            """UPDATE knowledge_sources
                  SET status = 'READY', chunk_count = %s, character_count = %s, processed_at = now(),
                      locked_at = NULL, error = NULL, updated_at = now(),
                      title = CASE WHEN %s::text IS NOT NULL AND (title = url OR title = file_name) THEN %s ELSE title END
                WHERE id = %s""",
            (
                len(chunks),
                content.character_count,
                content.title,
                (content.title or "")[:200],
                job.id,
            ),
        )
    log.info("Ingested %s: %d chunks", job.id, len(chunks))


async def _finish_failed(job: Job, message: str, *, permanent: bool, settings: Settings) -> None:
    give_up = permanent or job.attempts >= settings.ingest_max_attempts
    async with connection() as conn:
        await conn.execute(
            """UPDATE knowledge_sources
                  SET status = %s, error = %s, updated_at = now(),
                      -- A retry waits (attempts x backoff) from now before it can be claimed again.
                      locked_at = CASE WHEN %s THEN NULL ELSE now() END
                WHERE id = %s""",
            ("FAILED" if give_up else "PENDING", message[:MAX_ERROR_LENGTH], give_up, job.id),
        )
    log.warning("Ingestion of %s %s: %s", job.id, "failed" if give_up else "will retry", message)


async def drain() -> int:
    """Processes jobs until none are ready. Returns how many were processed."""
    processed = 0
    while job := await claim_job():
        await process_job(job)
        processed += 1
    return processed


async def run_worker(stop: asyncio.Event) -> None:
    settings = get_settings()
    log.info("Ingestion worker started")
    while not stop.is_set():
        try:
            async with await AsyncConnection.connect(
                settings.database_url, autocommit=True
            ) as listener:
                await listener.execute(f"LISTEN {CHANNEL}")
                while not stop.is_set():
                    await drain()
                    # Wake on NOTIFY, or poll after POLL_SECONDS for retries and missed signals.
                    async for note in listener.notifies(timeout=POLL_SECONDS, stop_after=1):
                        log.debug("Woken by %s", json.dumps(note.payload))
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Ingestion worker error; restarting in 5s")
            await asyncio.sleep(5)
    log.info("Ingestion worker stopped")
