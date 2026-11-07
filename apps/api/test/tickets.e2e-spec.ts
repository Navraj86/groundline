import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService as PrismaServiceType } from '../src/prisma/prisma.service.js';
import { ensureFreePlan } from './helpers.js';

process.env.SUPABASE_JWT_SECRET ||= 'e2e-secret-for-signing-test-access-tokens-0123456789';

function token(userId: string, email: string): Promise<string> {
  return new SignJWT({ role: 'authenticated', email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET));
}

describe('Tickets (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServiceType;
  let orgId: string;
  const widgetKey = `wk_${randomBytes(18).toString('base64url')}`;
  const agent = { id: randomUUID(), email: `agent-${randomBytes(3).toString('hex')}@example.com` };
  const viewer = { id: randomUUID(), email: `viewer-${randomBytes(3).toString('hex')}@example.com` };
  let agentAuth: { authorization: string };
  let viewerAuth: { authorization: string };

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await ensureFreePlan(prisma);

    const org = await prisma.organization.create({
      data: { name: 'Ticket Test Co', slug: `ticket-test-${randomBytes(4).toString('hex')}`, widgetKey },
    });
    orgId = org.id;
    for (const [user, role] of [
      [agent, 'AGENT'],
      [viewer, 'VIEWER'],
    ] as const) {
      await prisma.user.create({ data: { id: user.id, email: user.email } });
      await prisma.organizationMember.create({ data: { organizationId: orgId, userId: user.id, role } });
    }
    agentAuth = { authorization: `Bearer ${await token(agent.id, agent.email)}` };
    viewerAuth = { authorization: `Bearer ${await token(viewer.id, viewer.email)}` };
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { id: { in: [agent.id, viewer.id] } } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('turns a customer handoff into a numbered ticket linked to the conversation', async () => {
    const { conversation, visitorToken } = (
      await http().post(`/widget/${widgetKey}/conversations`).send({}).expect(201)
    ).body;
    await http()
      .post(`/widget/conversations/${conversation.id}/escalate`)
      .set({ authorization: `Bearer ${visitorToken}` })
      .send({ email: 'dana@example.com', note: 'My order never arrived' })
      .expect(200);

    const list = await http().get(`/orgs/${orgId}/tickets`).set(agentAuth).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      number: 1001,
      source: 'CUSTOMER',
      status: 'OPEN',
      conversationId: conversation.id,
      contactEmail: 'dana@example.com',
    });

    // Escalating again doesn't open a second ticket.
    await http()
      .post(`/widget/conversations/${conversation.id}/escalate`)
      .set({ authorization: `Bearer ${visitorToken}` })
      .send({})
      .expect(200);
    expect((await http().get(`/orgs/${orgId}/tickets`).set(agentAuth)).body.items).toHaveLength(1);
  });

  it('numbers tickets sequentially and records every change in the history', async () => {
    const created = await http()
      .post(`/orgs/${orgId}/tickets`)
      .set(agentAuth)
      .send({ subject: 'Invoice address is wrong', priority: 'HIGH' })
      .expect(201);
    expect(created.body).toMatchObject({ number: 1002, source: 'AGENT', priority: 'HIGH' });

    // Viewers can't be assigned tickets.
    await http().patch(`/orgs/${orgId}/tickets/1002`).set(agentAuth).send({ assigneeId: viewer.id }).expect(400);

    const updated = await http()
      .patch(`/orgs/${orgId}/tickets/1002`)
      .set(agentAuth)
      .send({ status: 'IN_PROGRESS', priority: 'URGENT', assigneeId: agent.id })
      .expect(200);
    expect(updated.body).toMatchObject({ status: 'IN_PROGRESS', priority: 'URGENT', assignee: { id: agent.id } });

    const noted = await http()
      .post(`/orgs/${orgId}/tickets/1002/notes`)
      .set(agentAuth)
      .send({ body: 'Customer confirmed the new address by phone.' })
      .expect(201);
    expect(noted.body.events.map((e: { type: string }) => e.type)).toEqual([
      'CREATED',
      'STATUS_CHANGED',
      'PRIORITY_CHANGED',
      'ASSIGNED',
      'NOTE',
    ]);

    const mine = await http().get(`/orgs/${orgId}/tickets?assignee=me`).set(agentAuth).expect(200);
    expect(mine.body.items.map((t: { number: number }) => t.number)).toEqual([1002]);

    const resolved = await http().patch(`/orgs/${orgId}/tickets/1002`).set(agentAuth).send({ status: 'RESOLVED' });
    expect(resolved.body.resolvedAt).not.toBeNull();
  });

  it('keeps tickets away from viewers', async () => {
    await http().get(`/orgs/${orgId}/tickets`).set(viewerAuth).expect(403);
    await http().get(`/orgs/${orgId}/tickets/9999`).set(agentAuth).expect(404);
  });
});
