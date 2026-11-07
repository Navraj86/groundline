-- Text chunks and embeddings for knowledge sources. Owned by the AI service; the
-- knowledge_sources table itself is owned by the core API (Prisma).
CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS ai;

CREATE TABLE ai.knowledge_chunks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid        NOT NULL,
    source_id       uuid        NOT NULL REFERENCES public.knowledge_sources (id) ON DELETE CASCADE,
    chunk_index     integer     NOT NULL,
    content         text        NOT NULL,
    token_count     integer     NOT NULL,
    embedding       vector(1536) NOT NULL,
    embedding_model text        NOT NULL,
    metadata        jsonb       NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_id, chunk_index)
);

CREATE INDEX knowledge_chunks_org_idx ON ai.knowledge_chunks (organization_id);
CREATE INDEX knowledge_chunks_embedding_idx ON ai.knowledge_chunks
    USING hnsw (embedding vector_cosine_ops);
