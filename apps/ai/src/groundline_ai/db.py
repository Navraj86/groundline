"""Postgres access for the AI service (psycopg 3 + pgvector)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from pgvector.psycopg import register_vector_async
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from groundline_ai.config import get_settings

_pool: AsyncConnectionPool | None = None


async def _configure(conn: AsyncConnection) -> None:
    await register_vector_async(conn)


async def open_pool() -> AsyncConnectionPool:
    global _pool
    if _pool is None:
        _pool = AsyncConnectionPool(
            get_settings().database_url,
            min_size=1,
            max_size=10,
            kwargs={"row_factory": dict_row, "autocommit": True},
            configure=_configure,
            open=False,
        )
        await _pool.open(wait=True, timeout=15)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def connection() -> AsyncIterator[AsyncConnection]:
    pool = await open_pool()
    async with pool.connection() as conn:
        yield conn
