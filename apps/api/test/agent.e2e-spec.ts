import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { AgentStepRequest, AgentStepResult, AiClient as AiClientType } from '../src/chat/ai-client.service.js';
import type { PrismaService as PrismaServiceType } from '../src/prisma/prisma.service.js';
import { ensureFreePlan } from './helpers.js';

process.env.SUPABASE_JWT_SECRET ||= 'e2e-secret-for-signing-test-access-tokens-0123456789';

const seen: AgentStepRequest[] = [];

function reply(answer: string): AgentStepResult {
  return {
    status: 'ANSWERED',
    answer,
    tool_calls: [],
    sources: [],
    provider: 'openai',
    model: 'gpt-test',
    input_tokens: 10,
    output_tokens: 5,
    latency_ms: 1,
  };
}

function call(name: string, args: object): AgentStepResult {
  return { ...reply(''), status: 'TOOL_CALLS', tool_calls: [{ call_id: `call_${randomUUID()}`, name, arguments: JSON.stringify(args) }] };
}

/** A scripted model: which tool it asks for depends on the question and the results so far. */
const fakeAi: Pick<AiClientType, 'respond'> = {
  async respond(req) {
    seen.push(req);
    const q = req.question.toLowerCase();
    const last = req.steps.at(-1);
    if (q.includes('orders')) return last ? reply(`Here are your orders: ${last.output}`) : call('list_orders', {});
    if (q.includes('refund')) {
      if (req.steps.length === 0) return call('list_orders', {});
      if (req.steps.length === 1) {
        const orders = JSON.parse(last!.output).result as { id: string }[];
        return call('request_refund', { orderId: orders[0]!.id, amountCents: null, reason: 'Arrived broken' });
      }
      return reply('Your refund request is pending review by the team.');
    }
    if (q.includes('delete')) return last ? reply(`Result: ${last.output}`) : call('delete_account', {});
    if (q.includes('someone else')) return last ? reply(`Result: ${last.output}`) : call('get_customer_profile', { email: 'other@example.com' });
    if (q.includes('human')) {
      return last ? reply('A teammate will reply here.') : call('create_ticket', { subject: 'Needs a human', summary: 'Asked for a person', priority: 'HIGH' });
    }
    return reply('Hello!');
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

describe('Agent tools and approvals (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServiceType;
  let orgId: string;
  let identitySecret: string;
  const widgetKey = `wk_${randomBytes(18).toString('base64url')}`;
  const owner = { id: randomUUID(), email: `owner-${randomBytes(3).toString('hex')}@example.com` };
  const agent = { id: randomUUID(), email: `agent-${randomBytes(3).toString('hex')}@example.com` };
  let ownerAuth: { authorization: string };
  let agentAuth: { authorization: string };

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    const { AiClient } = await import('../src/chat/ai-client.service.js');
    const { configureApp } = await import('../src/app.setup.js');
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

    orgId = (
      await prisma.organization.create({
        data: { name: 'Agent Test Co', slug: `agent-test-${randomBytes(4).toString('hex')}`, widgetKey },
      })
    ).id;
    for (const [user, role] of [
      [owner, 'OWNER'],
      [agent, 'AGENT'],
    ] as const) {
      await prisma.user.create({ data: { id: user.id, email: user.email } });
      await prisma.organizationMember.create({ data: { organizationId: orgId, userId: user.id, role } });
    }
    ownerAuth = { authorization: `Bearer ${await accessToken(owner.id, owner.email)}` };
    agentAuth = { authorization: `Bearer ${await accessToken(agent.id, agent.email)}` };

    await request(app.getHttpServer()).put(`/orgs/${orgId}/integrations/sandbox`).set(ownerAuth).send({ enabled: true }).expect(200);
    const identity = await request(app.getHttpServer()).post(`/orgs/${orgId}/identity/rotate`).set(ownerAuth).expect(201);
    identitySecret = identity.body.secret;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, agent.id] } } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function chat(userToken?: string) {
    const res = await http().post(`/widget/${widgetKey}/conversations`).send(userToken ? { userToken } : {}).expect(201);
    const auth = { authorization: `Bearer ${res.body.visitorToken}` };
    return {
      id: res.body.conversation.id as string,
      verified: res.body.conversation.verified as boolean,
      say: (content: string) =>
        http().post(`/widget/conversations/${res.body.conversation.id}/messages`).set(auth).send({ content }).expect(201),
      read: () => http().get(`/widget/conversations/${res.body.conversation.id}`).set(auth).expect(200),
    };
  }

  function signIdentity(sub: string, secret = identitySecret) {
    return new SignJWT({ email: 'sam@example.com', name: 'Sam Lee' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(sub)
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret));
  }

  it('offers anonymous visitors no account tools', async () => {
    const c = await chat();
    expect(c.verified).toBe(false);
    await c.say('hello');
    expect(seen.at(-1)!.tools.map((t) => t.name)).toEqual(['create_ticket']);
    expect(seen.at(-1)!.customerSignedIn).toBe(false);
  });

  it('rejects identity tokens not signed with the organization secret', async () => {
    const forged = await signIdentity('cust_1', 'not-the-real-secret-but-long-enough-0000');
    await http().post(`/widget/${widgetKey}/conversations`).send({ userToken: forged }).expect(401);
  });

  it("runs read-only tools for a verified customer and records the run", async () => {
    const c = await chat(await signIdentity('cust_42'));
    expect(c.verified).toBe(true);
    const res = await c.say('Show me my orders');
    expect(res.body.reply.content).toContain('ORD-');
    expect(seen.at(-1)!.tools.map((t) => t.name)).toContain('request_refund');

    const calls = await prisma.toolCall.findMany({ where: { conversationId: c.id } });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ tool: 'list_orders', status: 'SUCCEEDED', sensitive: false });
    const run = await prisma.agentRun.findFirstOrThrow({ where: { conversationId: c.id } });
    expect(run).toMatchObject({ status: 'COMPLETED', steps: 1, messageId: res.body.reply.id, inputTokens: 20 });
    expect(calls[0]!.agentRunId).toBe(run.id);
  });

  it('holds refunds for approval and lets only owners and admins decide', async () => {
    const c = await chat(await signIdentity('cust_7'));
    const res = await c.say('I want a refund, it arrived broken');
    expect(res.body.reply.content).toContain('pending review');

    const refund = await prisma.toolCall.findFirstOrThrow({ where: { conversationId: c.id, tool: 'request_refund' } });
    expect(refund.status).toBe('PENDING_APPROVAL');
    const pending = await http().get(`/orgs/${orgId}/approvals?status=PENDING`).set(agentAuth).expect(200);
    const approval = pending.body.items.find((a: { conversationId: string }) => a.conversationId === c.id);
    expect(approval.summary).toMatch(/^Refund the full amount for order ORD-/);
    expect((await c.read()).body.pendingApprovals).toBe(1);

    // Support agents can see approvals but not decide them.
    await http().post(`/orgs/${orgId}/approvals/${approval.id}/decision`).set(agentAuth).send({ decision: 'APPROVE' }).expect(403);

    const decided = await http()
      .post(`/orgs/${orgId}/approvals/${approval.id}/decision`)
      .set(ownerAuth)
      .send({ decision: 'APPROVE' })
      .expect(200);
    expect(decided.body).toMatchObject({ status: 'APPROVED', result: { status: 'SUCCEEDED' } });
    await http().post(`/orgs/${orgId}/approvals/${approval.id}/decision`).set(ownerAuth).send({ decision: 'APPROVE' }).expect(409);

    const thread = (await c.read()).body;
    expect(thread.pendingApprovals).toBe(0);
    expect(thread.messages.at(-1)).toMatchObject({ role: 'AGENT' });
    expect(thread.messages.at(-1).content).toContain('approved and completed');

    // The sandbox store now shows the order as refunded.
    const orders = await c.say('Show me my orders');
    expect(orders.body.reply.content).toContain('"status":"refunded"');
  });

  it('blocks unknown tools and invalid input', async () => {
    const c = await chat(await signIdentity('cust_9'));
    await c.say('Please delete my account');
    await c.say("Look up someone else's profile");
    const calls = await prisma.toolCall.findMany({ where: { conversationId: c.id }, orderBy: { createdAt: 'asc' } });
    expect(calls.map((t) => [t.tool, t.status])).toEqual([
      ['delete_account', 'BLOCKED'],
      ['get_customer_profile', 'BLOCKED'],
    ]);
    expect(calls[1]!.error).toMatch(/Invalid input/);
  });

  it('hands the conversation to the team with create_ticket', async () => {
    const c = await chat();
    const res = await c.say('I need a human');
    expect(res.body.status).toBe('ESCALATED');
    const ticket = await prisma.ticket.findFirstOrThrow({ where: { conversationId: c.id } });
    expect(ticket).toMatchObject({ source: 'AI', priority: 'HIGH', subject: 'Needs a human' });
  });
});
