import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { AiClient as AiClientType, EvalCaseRequest, EvalCaseResult, GradeResult } from '../src/chat/ai-client.service.js';
import type { PrismaService as PrismaServiceType } from '../src/prisma/prisma.service.js';
import { ensureFreePlan } from './helpers.js';

process.env.SUPABASE_JWT_SECRET ||= 'e2e-secret-for-signing-test-access-tokens-0123456789';
// This spec exercises background jobs, so it runs the workers in-process.
process.env.WORKERS_ENABLED = 'true';

const grade = (over: Partial<GradeResult> = {}): GradeResult => ({
  relevance: 1,
  groundedness: 1,
  correctness: null,
  unsupported_claims: [],
  notes: 'Fine.',
  judge: 'openai:judge-test',
  input_tokens: 100,
  output_tokens: 20,
  ...over,
});

/** A scripted AI service: declines off-topic questions, invents a fact when asked about warranties. */
const fakeAi: Pick<AiClientType, 'respond' | 'evalCase' | 'gradeAnswer'> = {
  async respond() {
    throw new Error('not used');
  },
  async evalCase(req: EvalCaseRequest): Promise<EvalCaseResult> {
    const base = {
      sources: [],
      provider: 'openai',
      model: 'gpt-6.1-sol',
      input_tokens: 300,
      output_tokens: 40,
      latency_ms: 800,
      prompt_version: 'support-test.1',
    };
    if (req.question.includes('poem')) {
      return { ...base, status: 'INSUFFICIENT_CONTEXT', answer: 'I can only help with Acme questions.', retrieved_source_ids: [], retrieval_hit: null, reciprocal_rank: null, grade: null };
    }
    const warranty = req.question.includes('warranty');
    return {
      ...base,
      status: 'ANSWERED',
      answer: warranty ? 'Every product has a lifetime warranty.' : 'Refunds are available within 30 days [1].',
      retrieved_source_ids: req.expectedSourceIds,
      retrieval_hit: req.expectedSourceIds.length ? true : null,
      reciprocal_rank: req.expectedSourceIds.length ? 1 : null,
      grade: warranty
        ? grade({ groundedness: 0.25, unsupported_claims: ['Every product has a lifetime warranty.'] })
        : grade({ correctness: req.expectedAnswer ? 1 : null }),
    };
  },
  async gradeAnswer() {
    return grade({ groundedness: 0.5, unsupported_claims: ['Free shipping on everything.'] });
  },
};

function accessToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ role: 'authenticated', email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET));
}

describe('Analytics, answer reviews and evaluations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServiceType;
  let orgId: string;
  let sourceId: string;
  const owner = { id: randomUUID(), email: `owner-${randomBytes(3).toString('hex')}@example.com` };
  const viewer = { id: randomUUID(), email: `viewer-${randomBytes(3).toString('hex')}@example.com` };
  let ownerAuth: { authorization: string };
  let viewerAuth: { authorization: string };
  let reviews: { review(messageId: string): Promise<unknown> };

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    const { AiClient } = await import('../src/chat/ai-client.service.js');
    const { AnswerReviewService } = await import('../src/chat/answer-review.service.js');
    const { configureApp } = await import('../src/app.setup.js');
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AiClient).useValue(fakeAi).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    reviews = app.get(AnswerReviewService);
    await ensureFreePlan(prisma);

    orgId = (
      await prisma.organization.create({
        data: { name: 'Quality Co', slug: `quality-${randomBytes(4).toString('hex')}`, widgetKey: `wk_${randomBytes(18).toString('base64url')}` },
      })
    ).id;
    for (const [user, role] of [
      [owner, 'OWNER'],
      [viewer, 'VIEWER'],
    ] as const) {
      await prisma.user.create({ data: { id: user.id, email: user.email } });
      await prisma.organizationMember.create({ data: { organizationId: orgId, userId: user.id, role } });
    }
    ownerAuth = { authorization: `Bearer ${await accessToken(owner.id, owner.email)}` };
    viewerAuth = { authorization: `Bearer ${await accessToken(viewer.id, viewer.email)}` };
    sourceId = (
      await prisma.knowledgeSource.create({ data: { organizationId: orgId, type: 'TEXT', status: 'READY', title: 'Refund policy' } })
    ).id;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, viewer.id] } } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const today = new Date().toISOString().slice(0, 10);

  /** A widget conversation with one AI reply; optionally escalated. */
  async function conversation(opts: { escalated?: boolean; inputTokens?: number } = {}) {
    const c = await prisma.conversation.create({
      data: {
        organizationId: orgId,
        channel: 'WIDGET',
        visitorId: randomUUID(),
        aiEngagedAt: new Date(),
        escalatedAt: opts.escalated ? new Date() : null,
        status: opts.escalated ? 'ESCALATED' : 'OPEN',
      },
    });
    await prisma.message.create({ data: { organizationId: orgId, conversationId: c.id, role: 'CUSTOMER', content: 'How do refunds work?' } });
    const reply = await prisma.message.create({
      data: {
        organizationId: orgId,
        conversationId: c.id,
        role: 'ASSISTANT',
        content: 'Refunds are available within 30 days, and shipping is free [1].',
        answerStatus: 'ANSWERED',
        sources: [{ index: 1, sourceId, title: 'Refund policy', url: null, pages: [], snippet: '…', chunkId: randomUUID() }],
      },
    });
    await prisma.agentRun.create({
      data: {
        organizationId: orgId,
        conversationId: c.id,
        messageId: reply.id,
        status: 'COMPLETED',
        steps: 0,
        provider: 'openai',
        model: 'gpt-6.1-sol-2026-09-30',
        inputTokens: opts.inputTokens ?? 1_000_000,
        outputTokens: 100_000,
        latencyMs: 2000,
      },
    });
    return { conversation: c, reply };
  }

  it('reports conversations, resolution, cost and flagged answers', async () => {
    const { reply } = await conversation();
    await conversation({ escalated: true });
    await prisma.ticket.create({ data: { organizationId: orgId, number: 1, subject: 'Help', source: 'CUSTOMER' } });
    await reviews.review(reply.id);

    const reviewed = await prisma.message.findUniqueOrThrow({ where: { id: reply.id } });
    expect(reviewed.groundedness).toBe(0.5);
    expect(reviewed.reviewTokens).toBe(120);

    // A viewer can read reports, in a legacy time zone name browsers still send.
    const res = await http()
      .get(`/orgs/${orgId}/analytics`)
      .query({ from: today, to: today, tz: 'Asia/Calcutta' })
      .set(viewerAuth)
      .expect(200);
    const r = res.body;
    expect(r.range.tz).toBe('Asia/Kolkata');
    expect(r.conversations).toMatchObject({ total: 2, aiEngaged: 2, aiResolved: 1, escalated: 1, resolutionRate: 0.5, customerMessages: 2 });
    expect(r.answers).toMatchObject({ total: 2, answered: 2, latency: { p50Ms: 2000 } });
    expect(r.tickets).toMatchObject({ created: 1, openNow: 1, bySource: { AI: 0, CUSTOMER: 1, AGENT: 0 } });
    // Two replies at 1M input + 0.1M output on gpt-6.1-sol ($2 / $10 per million) = $6, plus the review.
    expect(r.usage.byModel).toEqual([
      { provider: 'openai', model: 'gpt-6.1-sol-2026-09-30', replies: 2, inputTokens: 2_000_000, outputTokens: 200_000, costUsd: 6 },
    ]);
    expect(r.usage.costIncomplete).toBe(true); // the review's "judge-test" model has no price
    expect(r.quality).toMatchObject({ reviewed: 1, avgGroundedness: 0.5, flagged: 1 });
    expect(r.quality.recentFlagged[0]).toMatchObject({ messageId: reply.id, unsupportedClaims: ['Free shipping on everything.'] });
    expect(r.daily).toHaveLength(1);
    expect(r.daily[0]).toMatchObject({ conversations: 2, escalated: 1, aiReplies: 2, tickets: 1 });
  });

  it('rejects bad ranges and unknown time zones', async () => {
    await http().get(`/orgs/${orgId}/analytics`).query({ from: today, to: '2020-01-01' }).set(ownerAuth).expect(400);
    await http().get(`/orgs/${orgId}/analytics`).query({ from: '2020-01-01', to: today }).set(ownerAuth).expect(400);
    await http().get(`/orgs/${orgId}/analytics`).query({ from: today, to: today, tz: 'Mars/Olympus' }).set(ownerAuth).expect(400);
  });

  it('runs an evaluation dataset in the background and keeps its history', async () => {
    const guardrails = await http()
      .post(`/orgs/${orgId}/evaluations/datasets/from-template`)
      .set(ownerAuth)
      .send({ template: 'guardrails' })
      .expect(201);
    expect(guardrails.body.cases.length).toBeGreaterThanOrEqual(5);
    expect(guardrails.body.cases.every((c: { expectInsufficient: boolean }) => c.expectInsufficient)).toBe(true);

    const dataset = await http()
      .post(`/orgs/${orgId}/evaluations/datasets`)
      .set(ownerAuth)
      .send({ name: 'Policies' })
      .expect(201);
    const id = dataset.body.id as string;
    await http().post(`/orgs/${orgId}/evaluations/datasets`).set(ownerAuth).send({ name: 'Policies' }).expect(409);
    await http().post(`/orgs/${orgId}/evaluations/datasets/${id}/runs`).set(ownerAuth).expect(400); // no questions yet

    // Expected sources must belong to this organization.
    await http()
      .post(`/orgs/${orgId}/evaluations/datasets/${id}/cases`)
      .set(ownerAuth)
      .send({ question: 'Refunds?', expectedSourceIds: [randomUUID()] })
      .expect(400);
    await http()
      .post(`/orgs/${orgId}/evaluations/datasets/${id}/cases/import`)
      .set(ownerAuth)
      .send({
        cases: [
          { question: 'How long do I have to ask for a refund?', expectedAnswer: '30 days', expectedSourceIds: [sourceId] },
          { question: 'What warranty do you offer?' },
          { question: 'Write me a poem', expectInsufficient: true },
        ],
      })
      .expect(201);

    // Viewers can read evaluations but not run them.
    await http().get(`/orgs/${orgId}/evaluations/datasets/${id}`).set(viewerAuth).expect(200);
    await http().post(`/orgs/${orgId}/evaluations/datasets/${id}/runs`).set(viewerAuth).expect(403);

    const started = await http().post(`/orgs/${orgId}/evaluations/datasets/${id}/runs`).set(ownerAuth).expect(201);
    expect(started.body).toMatchObject({ status: 'QUEUED', totalCases: 3 });
    const runId = started.body.id as string;

    let run = started.body;
    for (let i = 0; i < 100 && run.status !== 'COMPLETED' && run.status !== 'FAILED'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      run = (await http().get(`/orgs/${orgId}/evaluations/runs/${runId}`).set(ownerAuth).expect(200)).body;
    }
    expect(run.status).toBe('COMPLETED');
    expect(run).toMatchObject({
      completedCases: 3,
      passedCases: 2,
      model: 'gpt-6.1-sol',
      judge: 'openai:judge-test',
      promptVersion: 'support-test.1',
      // The AI service reports answer and grading tokens together.
      inputTokens: 300 * 3,
    });
    expect(run.metrics).toMatchObject({
      passRate: 0.667,
      avgGroundedness: 0.625,
      hallucinationRate: 0.5,
      retrievalHitRate: 1,
      meanReciprocalRank: 1,
      declineAccuracy: 1,
      avgCorrectness: 1,
      errors: 0,
    });
    const warranty = run.results.find((x: { question: string }) => x.question.includes('warranty'));
    expect(warranty).toMatchObject({ passed: false, unsupportedClaims: ['Every product has a lifetime warranty.'] });

    // History survives editing the dataset.
    const caseId = (await prisma.evalCase.findFirstOrThrow({ where: { datasetId: id, question: { contains: 'warranty' } } })).id;
    await http().delete(`/orgs/${orgId}/evaluations/datasets/${id}/cases/${caseId}`).set(ownerAuth).expect(204);
    const after = await http().get(`/orgs/${orgId}/evaluations/runs/${runId}`).set(ownerAuth).expect(200);
    expect(after.body.results).toHaveLength(3);

    const history = await http().get(`/orgs/${orgId}/evaluations/runs`).query({ datasetId: id }).set(viewerAuth).expect(200);
    expect(history.body.items.map((r: { id: string }) => r.id)).toEqual([runId]);
    await http().post(`/orgs/${orgId}/evaluations/runs/${runId}/cancel`).set(ownerAuth).expect(409);
  });
});
