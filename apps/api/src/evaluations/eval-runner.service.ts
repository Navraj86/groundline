import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AiClient, type EvalCaseResult } from '../chat/ai-client.service.js';
import { readAssistantSettings } from '../chat/assistant.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CacheService } from '../queue/cache.service.js';
import { QueueService } from '../queue/queue.service.js';
import { QUEUES } from '../queue/queues.js';
import { RUN_JOB, type RunJob } from './evaluations.service.js';
import { casePassed, computeMetrics, type ScoredCase } from './metrics.js';

/** Questions answered at once within one run. */
const PARALLEL_CASES = 3;
/** Extra attempts for one question when the AI service fails, before recording an error. */
const CASE_RETRIES = 1;

/**
 * Runs evaluation datasets in the worker. Runs are resumable: cases that already have a
 * result are skipped, so a retried job picks up where a crashed one stopped.
 */
@Injectable()
export class EvalRunner implements OnModuleInit {
  private readonly logger = new Logger(EvalRunner.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClient,
    private readonly queues: QueueService,
    private readonly cache: CacheService,
  ) {}

  onModuleInit(): void {
    this.queues.handle<RunJob>(QUEUES.evaluations, RUN_JOB, (data, job) => this.run(data.runId, job));
  }

  async run(runId: string, job?: Job): Promise<void> {
    const run = await this.prisma.evalRun.findUnique({
      where: { id: runId },
      include: { organization: true, results: { select: { caseId: true } } },
    });
    if (!run || (run.status !== 'QUEUED' && run.status !== 'RUNNING')) return;

    await this.prisma.evalRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: run.startedAt ?? new Date() },
    });
    const done = new Set(run.results.map((r) => r.caseId));
    const cases = (await this.prisma.evalCase.findMany({ where: { datasetId: run.datasetId }, orderBy: { createdAt: 'asc' } })).filter(
      (c) => !done.has(c.id),
    );
    const settings = readAssistantSettings(run.organization.settings);
    const assistant = { name: settings.name, companyName: run.organization.name, instructions: settings.instructions };

    try {
      let next = 0;
      const worker = async () => {
        while (next < cases.length) {
          if (await this.cancelled(runId)) return;
          const c = cases[next++]!;
          const started = Date.now();
          let result: EvalCaseResult | null = null;
          let error: string | null = null;
          for (let attempt = 0; attempt <= CASE_RETRIES && !result; attempt++) {
            try {
              result = await this.ai.evalCase({
                organizationId: run.organizationId,
                question: c.question,
                history: [],
                assistant,
                expectedAnswer: c.expectedAnswer,
                expectedSourceIds: c.expectedSourceIds,
                expectInsufficient: c.expectInsufficient,
              });
            } catch (err) {
              error = (err as Error).message.slice(0, 500);
            }
          }
          await this.saveResult(runId, c, result, result ? null : error, Date.now() - started);
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL_CASES, cases.length) }, worker));
      if (await this.cancelled(runId)) return;
      await this.finish(runId);
    } catch (err) {
      this.logger.error(`Evaluation run ${runId} failed: ${(err as Error).message}`);
      if (!job || job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await this.markFailed(runId, (err as Error).message);
        return;
      }
      // Let BullMQ retry; the run resumes from the cases still missing a result.
      throw err;
    }
  }

  /** Marks runs that ran out of retries as failed, so they don't look stuck. */
  async markFailed(runId: string, message: string): Promise<void> {
    await this.prisma.evalRun.updateMany({
      where: { id: runId, status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'FAILED', error: message.slice(0, 500), completedAt: new Date() },
    });
  }

  private async cancelled(runId: string): Promise<boolean> {
    const run = await this.prisma.evalRun.findUnique({ where: { id: runId }, select: { status: true } });
    return run?.status === 'CANCELLED';
  }

  private async saveResult(
    runId: string,
    c: { id: string; question: string; expectedAnswer: string | null; expectInsufficient: boolean },
    result: EvalCaseResult | null,
    error: string | null,
    elapsedMs: number,
  ): Promise<void> {
    const scored: ScoredCase = {
      expectInsufficient: c.expectInsufficient,
      answerStatus: result?.status ?? 'ERROR',
      relevance: result?.grade?.relevance ?? null,
      groundedness: result?.grade?.groundedness ?? null,
      correctness: result?.grade?.correctness ?? null,
      retrievalHit: result?.retrieval_hit ?? null,
      reciprocalRank: result?.reciprocal_rank ?? null,
      latencyMs: result?.latency_ms ?? elapsedMs,
      error,
    };
    const passed = casePassed(scored);
    await this.prisma.$transaction(async (tx) => {
      try {
        await tx.evalResult.create({
          data: {
            runId,
            caseId: c.id,
            question: c.question,
            expectedAnswer: c.expectedAnswer,
            expectInsufficient: c.expectInsufficient,
            answer: result?.answer ?? '',
            answerStatus: scored.answerStatus,
            passed,
            relevance: scored.relevance,
            groundedness: scored.groundedness,
            correctness: scored.correctness,
            retrievalHit: scored.retrievalHit,
            reciprocalRank: scored.reciprocalRank,
            retrievedSourceIds: result?.retrieved_source_ids ?? [],
            unsupportedClaims: (result?.grade?.unsupported_claims ?? []) as Prisma.InputJsonValue,
            judgeNotes: result?.grade?.notes || null,
            latencyMs: scored.latencyMs,
            inputTokens: result?.input_tokens ?? 0,
            outputTokens: result?.output_tokens ?? 0,
            error,
          },
        });
      } catch (err) {
        // Already recorded by an earlier attempt of this job.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
        throw err;
      }
      await tx.evalRun.update({
        where: { id: runId },
        data: {
          completedCases: { increment: 1 },
          passedCases: { increment: passed ? 1 : 0 },
          inputTokens: { increment: result?.input_tokens ?? 0 },
          outputTokens: { increment: result?.output_tokens ?? 0 },
          // The first answer tells us which prompt, model and judge this run used.
          ...(result?.model ? { provider: result.provider, model: result.model } : {}),
          ...(result?.prompt_version ? { promptVersion: result.prompt_version } : {}),
          ...(result?.grade?.judge ? { judge: result.grade.judge } : {}),
        },
      });
    });
  }

  private async finish(runId: string): Promise<void> {
    const results = await this.prisma.evalResult.findMany({ where: { runId } });
    const metrics = computeMetrics(
      results.map((r) => ({
        expectInsufficient: r.expectInsufficient,
        answerStatus: r.answerStatus,
        relevance: r.relevance,
        groundedness: r.groundedness,
        correctness: r.correctness,
        retrievalHit: r.retrievalHit,
        reciprocalRank: r.reciprocalRank,
        latencyMs: r.latencyMs,
        error: r.error,
        passed: r.passed,
      })),
    );
    const run = await this.prisma.evalRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        metrics: metrics as unknown as Prisma.InputJsonValue,
        completedCases: results.length,
        passedCases: results.filter((r) => r.passed).length,
      },
    });
    await this.cache.invalidate(`analytics:${run.organizationId}:`);
  }
}
