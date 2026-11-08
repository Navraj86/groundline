-- CreateEnum
CREATE TYPE "EvalRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "eval_datasets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "eval_datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_cases" (
    "id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "expected_answer" TEXT,
    "expected_source_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "expect_insufficient" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "eval_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "status" "EvalRunStatus" NOT NULL DEFAULT 'QUEUED',
    "total_cases" INTEGER NOT NULL,
    "completed_cases" INTEGER NOT NULL DEFAULT 0,
    "passed_cases" INTEGER NOT NULL DEFAULT 0,
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "prompt_version" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "judge" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_by_id" UUID,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_results" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "case_id" UUID,
    "question" TEXT NOT NULL,
    "expected_answer" TEXT,
    "expect_insufficient" BOOLEAN NOT NULL DEFAULT false,
    "answer" TEXT NOT NULL,
    "answer_status" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "relevance" DOUBLE PRECISION,
    "groundedness" DOUBLE PRECISION,
    "correctness" DOUBLE PRECISION,
    "retrieval_hit" BOOLEAN,
    "reciprocal_rank" DOUBLE PRECISION,
    "retrieved_source_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unsupported_claims" JSONB NOT NULL DEFAULT '[]',
    "judge_notes" TEXT,
    "latency_ms" INTEGER NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "eval_datasets_organization_id_name_key" ON "eval_datasets"("organization_id", "name");

-- CreateIndex
CREATE INDEX "eval_cases_dataset_id_created_at_idx" ON "eval_cases"("dataset_id", "created_at");

-- CreateIndex
CREATE INDEX "eval_runs_organization_id_created_at_idx" ON "eval_runs"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "eval_runs_dataset_id_created_at_idx" ON "eval_runs"("dataset_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "eval_results_run_id_created_at_idx" ON "eval_results"("run_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "eval_results_run_id_case_id_key" ON "eval_results"("run_id", "case_id");

-- AddForeignKey
ALTER TABLE "eval_datasets" ADD CONSTRAINT "eval_datasets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_datasets" ADD CONSTRAINT "eval_datasets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "eval_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "eval_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "eval_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "eval_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

