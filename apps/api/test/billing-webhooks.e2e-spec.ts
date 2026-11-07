import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import { Webhook } from 'standardwebhooks';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService as PrismaServiceType } from '../src/prisma/prisma.service.js';

// Must be set before the app module (and its config) is loaded.
const SECRET = `whsec_${randomBytes(24).toString('base64')}`;
process.env.DODO_PAYMENTS_WEBHOOK_KEY = SECRET;

const PRODUCT_ID = `pdt_e2e_${randomBytes(4).toString('hex')}`;
const signer = new Webhook(SECRET);

describe('Dodo Payments webhooks (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServiceType;
  let orgId: string;
  let planId: string;
  const subscriptionId = `sub_e2e_${randomBytes(4).toString('hex')}`;
  const customerId = `cus_e2e_${randomBytes(4).toString('hex')}`;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.plan.upsert({
      where: { key: 'free' },
      create: { key: 'free', name: 'Free', description: 'Free', priceCents: 0, limits: { members: 2 }, features: [] },
      update: {},
    });
    const plan = await prisma.plan.create({
      data: {
        key: `e2e-${randomBytes(4).toString('hex')}`,
        name: 'E2E Paid',
        description: 'Paid plan used by tests',
        priceCents: 2900,
        dodoProductId: PRODUCT_ID,
        limits: { members: 10, knowledgeSources: 10, monthlyMessages: 10 },
        features: [],
        isPublic: false,
      },
    });
    planId = plan.id;
    const org = await prisma.organization.create({
      data: { name: 'Webhook Test Org', slug: `webhook-test-${randomBytes(4).toString('hex')}` },
    });
    orgId = org.id;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.plan.delete({ where: { id: planId } });
    await app.close();
  });

  function subscriptionData(overrides: Record<string, unknown> = {}) {
    return {
      payload_type: 'Subscription',
      subscription_id: subscriptionId,
      product_id: PRODUCT_ID,
      status: 'active',
      customer: { customer_id: customerId, email: 'owner@example.com', name: 'Owner' },
      metadata: { organization_id: orgId },
      previous_billing_date: '2026-11-01T00:00:00Z',
      next_billing_date: '2026-12-01T00:00:00Z',
      cancel_at_next_billing_date: false,
      cancelled_at: null,
      ...overrides,
    };
  }

  function send(type: string, data: object, opts: { id?: string; at?: string; secret?: Webhook } = {}) {
    const id = opts.id ?? `msg_${randomUUID()}`;
    const body = JSON.stringify({ business_id: 'bus_test', type, timestamp: opts.at ?? new Date().toISOString(), data });
    const now = new Date();
    return request(app.getHttpServer())
      .post('/webhooks/dodo')
      .set('content-type', 'application/json')
      .set('webhook-id', id)
      .set('webhook-timestamp', Math.floor(now.getTime() / 1000).toString())
      .set('webhook-signature', (opts.secret ?? signer).sign(id, now, body))
      .send(body);
  }

  it('rejects deliveries with an invalid signature', async () => {
    const forged = new Webhook(`whsec_${randomBytes(24).toString('base64')}`);
    await send('subscription.active', subscriptionData(), { secret: forged }).expect(401);
    expect(await prisma.subscription.findUnique({ where: { organizationId: orgId } })).toBeNull();
  });

  it('activates the subscription from subscription.active', async () => {
    const res = await send('subscription.active', subscriptionData(), { at: '2026-11-07T10:00:00Z' }).expect(200);
    expect(res.body.status).toBe('processed');

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: orgId } });
    expect(sub.status).toBe('ACTIVE');
    expect(sub.planId).toBe(planId);
    expect(sub.dodoSubscriptionId).toBe(subscriptionId);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.dodoCustomerId).toBe(customerId);
  });

  it('applies a redelivered event only once', async () => {
    const id = `msg_${randomUUID()}`;
    const data = subscriptionData({ cancel_at_next_billing_date: true });
    await send('subscription.updated', data, { id, at: '2026-11-07T11:00:00Z' }).expect(200);
    const auditsBefore = await prisma.auditLog.count({ where: { organizationId: orgId } });

    const again = await send('subscription.updated', data, { id, at: '2026-11-07T11:00:00Z' }).expect(200);
    expect(again.body.status).toBe('duplicate');
    expect(await prisma.auditLog.count({ where: { organizationId: orgId } })).toBe(auditsBefore);
    expect(await prisma.paymentEvent.count({ where: { webhookId: id } })).toBe(1);
  });

  it('ignores events older than the state already applied', async () => {
    const res = await send('subscription.on_hold', subscriptionData({ status: 'on_hold' }), {
      at: '2026-11-07T09:00:00Z',
    }).expect(200);
    expect(res.body.status).toBe('ignored');
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: orgId } });
    expect(sub.status).toBe('ACTIVE');
    expect(sub.cancelAtPeriodEnd).toBe(true);
  });

  it('records payments for the organization', async () => {
    const paymentId = `pay_e2e_${randomBytes(4).toString('hex')}`;
    await send('payment.succeeded', {
      payload_type: 'Payment',
      payment_id: paymentId,
      subscription_id: subscriptionId,
      total_amount: 2900,
      currency: 'USD',
      status: 'succeeded',
      charge_type: 'new',
      customer: { customer_id: customerId, email: 'owner@example.com', name: 'Owner' },
      metadata: {},
      created_at: '2026-11-07T10:01:00Z',
    }).expect(200);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { dodoPaymentId: paymentId } });
    expect(payment.organizationId).toBe(orgId);
    expect(payment.amountCents).toBe(2900);
  });

  it('drops back to the free plan when the subscription is cancelled', async () => {
    await send(
      'subscription.cancelled',
      subscriptionData({ status: 'cancelled', cancelled_at: '2026-12-01T00:00:00Z' }),
      { at: '2026-12-01T00:00:05Z' },
    ).expect(200);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: orgId } });
    expect(sub.status).toBe('CANCELLED');
  });

  it('acknowledges but ignores events for unknown organizations', async () => {
    const res = await send(
      'subscription.active',
      subscriptionData({
        subscription_id: 'sub_unknown',
        customer: { customer_id: 'cus_unknown', email: 'x@example.com', name: 'X' },
        metadata: {},
      }),
    ).expect(200);
    expect(res.body.status).toBe('ignored');
  });
});
