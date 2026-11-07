"""Applies the AI service's SQL migrations (the `ai` schema) in order, once each.

Run with `uv run python -m groundline_ai.migrate`; the service also runs it on startup.
"""

import logging
from pathlib import Path

from psycopg import AsyncConnection

from groundline_ai.aio import run
from groundline_ai.config import get_settings

log = logging.getLogger(__name__)
MIGRATIONS_DIR = Path(__file__).parent / "migrations"


async def migrate() -> list[str]:
    applied: list[str] = []
    async with await AsyncConnection.connect(get_settings().database_url, autocommit=True) as conn:
        await conn.execute("CREATE SCHEMA IF NOT EXISTS ai")
        await conn.execute(
            """CREATE TABLE IF NOT EXISTS ai.schema_migrations (
                   name text PRIMARY KEY,
                   applied_at timestamptz NOT NULL DEFAULT now())"""
        )
        # Serialize concurrent starts (several workers booting at once).
        await conn.execute("SELECT pg_advisory_lock(hashtext('groundline_ai_migrations'))")
        try:
            done = {
                r[0]
                for r in await (
                    await conn.execute("SELECT name FROM ai.schema_migrations")
                ).fetchall()
            }
            for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
                if path.name in done:
                    continue
                async with conn.transaction():
                    await conn.execute(path.read_text(encoding="utf-8"))
                    await conn.execute(
                        "INSERT INTO ai.schema_migrations (name) VALUES (%s)", (path.name,)
                    )
                applied.append(path.name)
                log.info("Applied migration %s", path.name)
        finally:
            await conn.execute("SELECT pg_advisory_unlock(hashtext('groundline_ai_migrations'))")
    return applied


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(run(migrate()) or "Up to date")
