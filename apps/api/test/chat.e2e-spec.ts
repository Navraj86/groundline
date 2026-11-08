import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { AgentStepRequest, AiClient as AiClientType } from '../src/chat/ai-client.service.js';
import type { PrismaService as PrismaServiceType } from '../src/prisma/prisma.service.js';
import { ensureFreePlan } from './helpers.js';

process.env.SUPABASE_JWT_SECRET ||= 'e2e-secret-for-signing-test-access-tokens-0123456789';

const answers: AgentStepRequest[] = [];
const fakeAi: Pick<AiClientType, 'respond'> = {
  async respond(req) {
    answers.push(req);
    if (req.question.includes('unknown')) {
      return {
        status: 'INSUFFICIENT_CONTEXT',
        answer: "I couldn't find that.",
        tool_calls: [],
        sources: [],
        provider: null,
        model: null,
        input_tokens: null,
        output_tokens: null,
        latency_ms: 3,
      };
    }
    return {
      status: 'ANSWERED',
      answer: 'Refunds are available within 30 days [1].',
      tool_calls: [],
      sources: [
        {
          index: 1,
          source_id: randomUUID(),
          chunk_id: randomUUID(),
          title: 'Refund policy',
          url: null,
          pages: [],
          snippet: 'Refunds within 30 days.',
          score: 0.9,
        },
      ],
      provider: 'openai',
      model: 'gpt-test',
      input_tokens: 120,
      output_tokens: 15,
      latency_ms: 42,
    };
  },
};

async function accessToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ role: 'authenticated', email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET));
}

describe('Chat widget and conversations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServiceType;
  let orgId: string;
  let otherOrgId: string;
  const widgetKey = `wk_${randomBytes(18).toString('base64url')}`;
  const userId = randomUUID();
  const email = `agent-${randomBytes(4).toString('hex')}@example.com`;
  let agentToken: string;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const { AiClient } = await import('../src/chat/ai-client.service.js');
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiClient)
      .useValue(fakeAi)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await ensureFreePlan(prisma);
    const suffix = randomBytes(4).toString('hex');
    const org = await prisma.organization.create({
      data: {
        name: 'Chat Test Co',
        slug: `chat-test-${suffix}`,
        widgetKey,
        settings: { assistant: { name: 'Ava', greeting: 'Hi!', instructions: 'Be brief.', brandColor: '#2563eb' } },
      },
    });
    orgId = org.id;
    otherOrgId = (await prisma.organization.create({ data: { name: 'Other Co', slug: `other-${suffix}` } })).id;
    await prisma.user.create({ data: { id: userId, email } });
    await prisma.organizationMember.create({ data: { organizationId: orgId, userId, role: 'AGENT' } });
    agentToken = await accessToken(userId, email);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('serves the public widget config and rejects unknown keys', async () => {
    const res = await http().get(`/widget/${widgetKey}`).expect(200);
    expect(res.body).toEqual({
      organizationName: 'Chat Test Co',
      assistantName: 'Ava',
      greeting: 'Hi!',
      brandColor: '#2563eb',
    });
    await http().get('/widget/wk_doesnotexist0000').expect(404);
  });

  it('answers a customer, stores sources, and counts the conversation once', async () => {
    const start = await http().post(`/widget/${widgetKey}/conversations`).send({ name: 'Dana' }).expect(201);
    const { conversation, visitorToken } = start.body;
    const auth = { authorization: `Bearer ${visitorToken}` };

    const first = await http()
      .post(`/widget/conversations/${conversation.id}/messages`)
      .set(auth)
      .send({ content: 'What is the refund policy?' })
      .expect(201);
    expect(first.body.reply.answerStatus).toBe('ANSWERED');
    expect(first.body.reply.sources[0]).toMatchObject({ index: 1, title: 'Refund policy' });
    expect(first.body.reply.meta).toBeUndefined(); // model details stay internal

    await http()
      .post(`/widget/conversations/${conversation.id}/messages`)
      .set(auth)
      .send({ content: 'And for unknown items?' })
      .expect(201);

    // The second question carries the first exchange as history, and the assistant profile.
    const last = answers[answers.length - 1]!;
    expect(last.history.map((m) => m.role)).toEqual(['CUSTOMER', 'ASSISTANT']);
    expect(last.assistant).toEqual({ name: 'Ava', companyName: 'Chat Test Co', instructions: 'Be brief.' });

    const usage = await prisma.usageCounter.findMany({ where: { organizationId: orgId } });
    expect(usage.reduce((sum, u) => sum + u.count, 0)).toBe(1);

    const stored = await prisma.message.findFirstOrThrow({
      where: { conversationId: conversation.id, role: 'ASSISTANT', answerStatus: 'ANSWERED' },
    });
    expect(stored).toMatchObject({ provider: 'openai', model: 'gpt-test', inputTokens: 120, outputTokens: 15 });
  });

  it('scopes visitor tokens to their own conversation', async () => {
    const a = (await http().post(`/widget/${widgetKey}/conversations`).send({}).expect(201)).body;
    const b = (await http().post(`/widget/${widgetKey}/conversations`).send({}).expect(201)).body;
    await http()
      .get(`/widget/conversations/${a.conversation.id}`)
      .set({ authorization: `Bearer ${b.visitorToken}` })
      .expect(401);
    await http().get(`/widget/conversations/${a.conversation.id}`).expect(401);
  });

  it('stops the AI after escalation and lets the team reply', async () => {
    const { conversation, visitorToken } = (
      await http().post(`/widget/${widgetKey}/conversations`).send({}).expect(201)
    ).body;
    const auth = { authorization: `Bearer ${visitorToken}` };
    await http()
      .post(`/widget/conversations/${conversation.id}/escalate`)
      .set(auth)
      .send({ email: 'dana@example.com' })
      .expect(200);

    const calls = answers.length;
    const after = await http()
      .post(`/widget/conversations/${conversation.id}/messages`)
      .set(auth)
      .send({ content: 'Hello?' })
      .expect(201);
    expect(after.body.reply).toBeNull();
    expect(after.body.status).toBe('ESCALATED');
    expect(answers.length).toBe(calls);

    const team = { authorization: `Bearer ${agentToken}` };
    const list = await http().get(`/orgs/${orgId}/conversations?status=ESCALATED`).set(team).expect(200);
    expect(list.body.items.map((c: { id: string }) => c.id)).toContain(conversation.id);

    await http()
      .post(`/orgs/${orgId}/conversations/${conversation.id}/messages`)
      .set(team)
      .send({ content: 'Hi Dana, this is the team.' })
      .expect(201);
    const seen = await http().get(`/widget/conversations/${conversation.id}`).set(auth).expect(200);
    expect(seen.body.messages.at(-1)).toMatchObject({ role: 'AGENT', content: 'Hi Dana, this is the team.' });
  });

  it("hides other organizations' conversations from team members", async () => {
    const team = { authorization: `Bearer ${agentToken}` };
    await http().get(`/orgs/${otherOrgId}/conversations`).set(team).expect(404);
  });
});
