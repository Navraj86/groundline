-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN     "prompt_version" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "groundedness" DOUBLE PRECISION,
ADD COLUMN     "relevance" DOUBLE PRECISION,
ADD COLUMN     "review_judge" TEXT,
ADD COLUMN     "review_notes" TEXT,
ADD COLUMN     "review_tokens" INTEGER,
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(6),
ADD COLUMN     "unsupported_claims" JSONB;

-- CreateIndex
CREATE INDEX "messages_organization_id_reviewed_at_idx" ON "messages"("organization_id", "reviewed_at");

