import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EVAL_MAX_CASES,
  EVAL_TEMPLATES,
  type CreateEvalDatasetInput,
  type EvalCaseInput,
  type EvalCaseView,
  type EvalDatasetDetail,
  type EvalDatasetSummary,
  type EvalMetrics,
  type EvalResultView,
  type EvalRunDetail,
  type EvalRunSummary,
  type EvalTemplate,
  type Paginated,
  type UpdateEvalDatasetInput,
} from '@groundline/shared';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext, OrgContext } from '../auth/auth.types.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueueService } from '../queue/queue.service.js';
import { QUEUES } from '../queue/queues.js';
import { TEMPLATE_CASES } from './templates.js';

export const RUN_JOB = 'run-evaluation';
export interface RunJob {
  runId: string;
}

const runInclude = {
  dataset: { select: { name: true } },
  createdBy: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.EvalRunInclude;
type RunRow = Prisma.EvalRunGetPayload<{ include: typeof runInclude }>;

/** Evaluation datasets, their test cases, and runs (FR-063 – FR-067). */
@Injectable()
export class EvaluationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly audit: AuditService,
  ) {}

  // ---- Datasets -------------------------------------------------------------------------

  async listDatasets(organizationId: string): Promise<EvalDatasetSummary[]> {
    const rows = await this.prisma.evalDataset.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { cases: true } },
        runs: { orderBy: { createdAt: 'desc' }, take: 1, include: runInclude },
      },
    });
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      caseCount: d._count.cases,
      lastRun: d.runs[0] ? toRunSummary(d.runs[0]) : null,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    }));
  }

  async getDataset(organizationId: string, datasetId: string): Promise<EvalDatasetDetail> {
    const d = await this.prisma.evalDataset.findFirst({
      where: { id: datasetId, organizationId },
      include: {
        cases: { orderBy: { createdAt: 'asc' } },
        runs: { orderBy: { createdAt: 'desc' }, take: 1, include: runInclude },
      },
    });
    if (!d) throw new NotFoundException('Dataset not found');
    const sourceIds = [...new Set(d.cases.flatMap((c) => c.expectedSourceIds))];
    const sources = sourceIds.length
      ? await this.prisma.knowledgeSource.findMany({ where: { id: { in: sourceIds }, organizationId }, select: { id: true, title: true } })
      : [];
    const titles = new Map(sources.map((s) => [s.id, s.title]));
    const cases: EvalCaseView[] = d.cases.map((c) => ({
      id: c.id,
      question: c.question,
      expectedAnswer: c.expectedAnswer,
      expectedSources: c.expectedSourceIds.map((id) => ({ id, title: titles.get(id) ?? 'Deleted source' })),
      expectInsufficient: c.expectInsufficient,
      createdAt: c.createdAt.toISOString(),
    }));
    return {
      id: d.id,
      name: d.name,
      description: d.description,
      caseCount: d.cases.length,
      lastRun: d.runs[0] ? toRunSummary(d.runs[0]) : null,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      cases,
    };
  }

  async createDataset(org: OrgContext, user: AuthContext, input: CreateEvalDatasetInput, cases: EvalCaseInput[] = []) {
    try {
      const dataset = await this.prisma.evalDataset.create({
        data: {
          organizationId: org.organizationId,
          name: input.name,
          description: input.description ?? null,
          createdById: user.userId,
          cases: { create: cases.map(caseData) },
        },
      });
      await this.audit.record({
        organizationId: org.organizationId,
        actorUserId: user.userId,
        action: 'evaluation.dataset_created',
        targetType: 'eval_dataset',
        targetId: dataset.id,
        metadata: { name: dataset.name, cases: cases.length },
      });
      return this.getDataset(org.organizationId, dataset.id);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A dataset with this name already exists.');
      }
      throw err;
    }
  }

  async createFromTemplate(org: OrgContext, user: AuthContext, template: EvalTemplate): Promise<EvalDatasetDetail> {
    const meta = EVAL_TEMPLATES[template];
    return this.createDataset(org, user, { name: meta.name, description: meta.description }, TEMPLATE_CASES[template]);
  }

  async updateDataset(organizationId: string, datasetId: string, input: UpdateEvalDatasetInput): Promise<EvalDatasetDetail> {
    await this.findDataset(organizationId, datasetId);
    try {
      await this.prisma.evalDataset.update({
        where: { id: datasetId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description || null } : {}),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A dataset with this name already exists.');
      }
      throw err;
    }
    return this.getDataset(organizationId, datasetId);
  }

  async deleteDataset(org: OrgContext, user: AuthContext, datasetId: string): Promise<void> {
    const dataset = await this.findDataset(org.organizationId, datasetId);
    await this.prisma.evalDataset.delete({ where: { id: datasetId } });
    await this.audit.record({
      organizationId: org.organizationId,
      actorUserId: user.userId,
      action: 'evaluation.dataset_deleted',
      targetType: 'eval_dataset',
      targetId: datasetId,
      metadata: { name: dataset.name },
    });
  }

  // ---- Cases ----------------------------------------------------------------------------

  async addCases(organizationId: string, datasetId: string, cases: EvalCaseInput[]): Promise<EvalDatasetDetail> {
    await this.findDataset(organizationId, datasetId);
    await this.assertSources(organizationId, cases);
    const existing = await this.prisma.evalCase.count({ where: { datasetId } });
    if (existing + cases.length > EVAL_MAX_CASES) {
      throw new BadRequestException(`A dataset can hold up to ${EVAL_MAX_CASES} questions.`);
    }
    await this.prisma.evalCase.createMany({ data: cases.map((c) => ({ datasetId, ...caseData(c) })) });
    await this.touch(datasetId);
    return this.getDataset(organizationId, datasetId);
  }

  async updateCase(organizationId: string, datasetId: string, caseId: string, input: EvalCaseInput): Promise<EvalDatasetDetail> {
    await this.findCase(organizationId, datasetId, caseId);
    await this.assertSources(organizationId, [input]);
    await this.prisma.evalCase.update({ where: { id: caseId }, data: caseData(input) });
    await this.touch(datasetId);
    return this.getDataset(organizationId, datasetId);
  }

  async deleteCase(organizationId: string, datasetId: string, caseId: string): Promise<void> {
    await this.findCase(organizationId, datasetId, caseId);
    await this.prisma.evalCase.delete({ where: { id: caseId } });
    await this.touch(datasetId);
  }

  // ---- Runs -----------------------------------------------------------------------------

  async startRun(org: OrgContext, user: AuthContext, datasetId: string): Promise<EvalRunSummary> {
    await this.findDataset(org.organizationId, datasetId);
    const total = await this.prisma.evalCase.count({ where: { datasetId } });
    if (total === 0) throw new BadRequestException('Add at least one question before running this dataset.');
    const active = await this.prisma.evalRun.findFirst({ where: { datasetId, status: { in: ['QUEUED', 'RUNNING'] } } });
    if (active) throw new ConflictException('This dataset is already being evaluated.');

    const run = await this.prisma.evalRun.create({
      data: { organizationId: org.organizationId, datasetId, totalCases: total, createdById: user.userId },
      include: runInclude,
    });
    try {
      await this.queues.add<RunJob>(QUEUES.evaluations, RUN_JOB, { runId: run.id }, { jobId: run.id });
    } catch (err) {
      await this.prisma.evalRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', error: 'Background jobs are unavailable. Try again shortly.', completedAt: new Date() },
      });
      throw new ConflictException(`Couldn't start the evaluation: ${(err as Error).message}`);
    }
    await this.audit.record({
      organizationId: org.organizationId,
      actorUserId: user.userId,
      action: 'evaluation.run_started',
      targetType: 'eval_run',
      targetId: run.id,
      metadata: { dataset: run.dataset.name, cases: total },
    });
    return toRunSummary(run);
  }

  async cancelRun(organizationId: string, runId: string): Promise<EvalRunSummary> {
    const run = await this.prisma.evalRun.findFirst({ where: { id: runId, organizationId } });
    if (!run) throw new NotFoundException('Run not found');
    if (run.status !== 'QUEUED' && run.status !== 'RUNNING') throw new ConflictException('This run has already finished.');
    // The runner checks the status between cases and stops.
    const updated = await this.prisma.evalRun.update({
      where: { id: runId },
      data: { status: 'CANCELLED', completedAt: new Date() },
      include: runInclude,
    });
    return toRunSummary(updated);
  }

  async listRuns(
    organizationId: string,
    opts: { datasetId?: string; limit: number; cursor?: string },
  ): Promise<Paginated<EvalRunSummary>> {
    const rows = await this.prisma.evalRun.findMany({
      where: { organizationId, ...(opts.datasetId ? { datasetId: opts.datasetId } : {}) },
      include: runInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, opts.limit).map(toRunSummary);
    return { items, nextCursor: rows.length > opts.limit ? items[items.length - 1]!.id : null };
  }

  async getRun(organizationId: string, runId: string): Promise<EvalRunDetail> {
    const run = await this.prisma.evalRun.findFirst({
      where: { id: runId, organizationId },
      include: { ...runInclude, results: { orderBy: { createdAt: 'asc' } } },
    });
    if (!run) throw new NotFoundException('Run not found');
    return {
      ...toRunSummary(run),
      results: run.results.map(
        (r): EvalResultView => ({
          id: r.id,
          caseId: r.caseId,
          question: r.question,
          expectedAnswer: r.expectedAnswer,
          expectInsufficient: r.expectInsufficient,
          answer: r.answer,
          answerStatus: r.answerStatus,
          passed: r.passed,
          relevance: r.relevance,
          groundedness: r.groundedness,
          correctness: r.correctness,
          retrievalHit: r.retrievalHit,
          reciprocalRank: r.reciprocalRank,
          unsupportedClaims: (r.unsupportedClaims as string[] | null) ?? [],
          judgeNotes: r.judgeNotes,
          latencyMs: r.latencyMs,
          error: r.error,
        }),
      ),
    };
  }

  // ---- Internals --------------------------------------------------------------------------

  private async findDataset(organizationId: string, datasetId: string) {
    const dataset = await this.prisma.evalDataset.findFirst({ where: { id: datasetId, organizationId } });
    if (!dataset) throw new NotFoundException('Dataset not found');
    return dataset;
  }

  private async findCase(organizationId: string, datasetId: string, caseId: string) {
    const found = await this.prisma.evalCase.findFirst({ where: { id: caseId, datasetId, dataset: { organizationId } } });
    if (!found) throw new NotFoundException('Question not found');
    return found;
  }

  /** Expected sources must belong to this organization. */
  private async assertSources(organizationId: string, cases: EvalCaseInput[]): Promise<void> {
    const ids = [...new Set(cases.flatMap((c) => c.expectedSourceIds))];
    if (!ids.length) return;
    const found = await this.prisma.knowledgeSource.count({ where: { id: { in: ids }, organizationId } });
    if (found !== ids.length) throw new BadRequestException('Some expected sources were not found in your knowledge base.');
  }

  private async touch(datasetId: string): Promise<void> {
    await this.prisma.evalDataset.update({ where: { id: datasetId }, data: { updatedAt: new Date() } });
  }
}

function caseData(c: EvalCaseInput) {
  return {
    question: c.question,
    expectedAnswer: c.expectInsufficient ? null : (c.expectedAnswer ?? null),
    expectedSourceIds: c.expectInsufficient ? [] : c.expectedSourceIds,
    expectInsufficient: c.expectInsufficient,
  };
}

export function toRunSummary(run: RunRow): EvalRunSummary {
  const raw = run.metrics as Record<string, unknown> | null;
  const metrics = raw && 'passRate' in raw ? (raw as unknown as EvalMetrics) : null;
  return {
    id: run.id,
    datasetId: run.datasetId,
    datasetName: run.dataset.name,
    status: run.status,
    totalCases: run.totalCases,
    completedCases: run.completedCases,
    passedCases: run.passedCases,
    metrics,
    promptVersion: run.promptVersion,
    provider: run.provider,
    model: run.model,
    judge: run.judge,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    error: run.error,
    createdBy: run.createdBy,
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
  };
}
