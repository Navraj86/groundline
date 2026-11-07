"""Semantic search over an organization's knowledge chunks."""

from dataclasses import dataclass

from groundline_ai.config import Settings
from groundline_ai.db import connection
from groundline_ai.embeddings import get_embedder

SEARCH_SQL = """
SELECT c.id::text AS chunk_id,
       c.source_id::text AS source_id,
       s.title,
       s.url,
       c.content,
       c.metadata,
       1 - (c.embedding <=> %(vec)s::vector) AS score
  FROM ai.knowledge_chunks c
  JOIN public.knowledge_sources s ON s.id = c.source_id
 WHERE c.organization_id = %(org)s
   AND s.organization_id = %(org)s
   AND c.embedding_model = %(model)s
 ORDER BY c.embedding <=> %(vec)s::vector
 LIMIT %(k)s
"""


@dataclass
class Hit:
    chunk_id: str
    source_id: str
    title: str
    url: str | None
    content: str
    pages: list[int]
    score: float


async def search(organization_id: str, query: str, settings: Settings) -> list[Hit]:
    """Top chunks for `query` above the relevance threshold, from this organization only."""
    embedder = get_embedder(settings)
    [vector] = await embedder.embed([query])
    async with connection() as conn:
        rows = await (
            await conn.execute(
                SEARCH_SQL,
                {
                    "vec": str(vector),
                    "org": organization_id,
                    "model": embedder.model,
                    "k": settings.retrieval_top_k,
                },
            )
        ).fetchall()
    return [
        Hit(
            chunk_id=r["chunk_id"],
            source_id=r["source_id"],
            title=r["title"],
            url=r["url"],
            content=r["content"],
            pages=(r["metadata"] or {}).get("pages", []),
            score=float(r["score"]),
        )
        for r in rows
        if float(r["score"]) >= settings.retrieval_min_score
    ]
