/**
 * Sends signed Dodo Payments webhook events to the local API, to exercise billing flows
 * without a payment provider account.
 *
 *   pnpm billing:simulate <org-slug> <scenario> [plan-key]
 *
 * Scenarios: activate, renew, past-due, on-hold, schedule-cancel, resume, cancel, change-plan
 *
 * Requires DODO_PAYMENTS_WEBHOOK_KEY (any `whsec_...` secret works locally) and a plan with a
 * dodo_product_id. In development, seed placeholder ids with:
 *   DODO_PRODUCT_STARTER=pdt_local_starter DODO_PRODUCT_GROWTH=pdt_local_growth pnpm db:seed
 */
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Webhook } from 'standardwebhooks';
import { PrismaClient } from '../src/generated/prisma/client.js';

for (const file of ['.env', '../../.env']) if (existsSync(file)) process.loadEnvFile(file);

const [slug, scenario, planKey = 'starter'] = process.argv.slice(2);
const SCENARIOS = ['activate', 'renew', 'past-due', 'on-hold', 'schedule-cancel', 'resume', 'cancel', 'change-plan'];
if (!slug || !scenario || !SCENARIOS.includes(scenario)) {
  console.error(`Usage: pnpm billing:simulate <org-slug> <${SCENARIOS.join('|')}> [plan-key]`);
  process.exit(1);
}
const secret = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
if (!secret) {
  console.error('Set DODO_PAYMENTS_WEBHOOK_KEY in .env first.');
  process.exit(1);
}
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug }, include: { subscription: { include: { plan: true } } } });
  if (!org) throw new Error(`No organization with slug "${slug}"`);

  const targetKey = scenario === 'change-plan' || !org.subscription ? planKey : org.subscription.plan.key;
  const plan = await prisma.plan.findUnique({ where: { key: targetKey } });
  if (!plan?.dodoProductId) throw new Error(`Plan "${targetKey}" has no dodo_product_id (see the header of this script).`);

  const now = new Date();
  const nextMonth = new Date(now);
  nextMonth.setUTCMonth(now.getUTCMonth() + 1);
  const subscriptionId = org.subscription?.dodoSubscriptionId ?? `sub_sim_${org.id.slice(-12)}`;
  const customerId = org.dodoCustomerId ?? `cus_sim_${org.id.slice(-12)}`;

  const base = {
    payload_type: 'Subscription',
    subscription_id: subscriptionId,
    product_id: plan.dodoProductId,
    status: 'active',
    customer: { customer_id: customerId, email: 'billing@example.com', name: org.name },
    metadata: { organization_id: org.id, plan_key: plan.key },
    previous_billing_date: now.toISOString(),
    next_billing_date: nextMonth.toISOString(),
    cancel_at_next_billing_date: org.subscription?.cancelAtPeriodEnd ?? false,
    cancelled_at: null as string | null,
  };

  const events: { type: string; data: object }[] = [];
  const payment = (chargeType: string, status = 'succeeded') => ({
    type: status === 'succeeded' ? 'payment.succeeded' : 'payment.failed',
    data: {
      payload_type: 'Payment',
      payment_id: `pay_sim_${randomUUID().slice(0, 12)}`,
      subscription_id: subscriptionId,
      total_amount: plan.priceCents,
      currency: plan.currency,
      status,
      charge_type: chargeType,
      customer: base.customer,
      metadata: {},
      created_at: now.toISOString(),
    },
  });

  switch (scenario) {
    case 'activate':
      events.push({ type: 'subscription.active', data: base }, payment('new'));
      break;
    case 'renew':
      events.push({ type: 'subscription.renewed', data: base }, payment('renewal'));
      break;
    case 'past-due':
      events.push(
        { type: 'subscription.past_due', data: { ...base, status: 'past_due', past_due_ends_at: nextMonth.toISOString() } },
        payment('renewal', 'failed'),
      );
      break;
    case 'on-hold':
      events.push({ type: 'subscription.on_hold', data: { ...base, status: 'on_hold' } });
      break;
    case 'schedule-cancel':
      events.push({ type: 'subscription.updated', data: { ...base, cancel_at_next_billing_date: true } });
      break;
    case 'resume':
      events.push({ type: 'subscription.updated', data: { ...base, cancel_at_next_billing_date: false } });
      break;
    case 'cancel':
      events.push({ type: 'subscription.cancelled', data: { ...base, status: 'cancelled', cancelled_at: now.toISOString() } });
      break;
    case 'change-plan':
      events.push({ type: 'subscription.plan_changed', data: base }, payment('plan_change'));
      break;
  }

  const signer = new Webhook(secret!);
  for (const event of events) {
    const id = `msg_sim_${randomUUID()}`;
    const sentAt = new Date();
    const body = JSON.stringify({ business_id: 'bus_simulated', type: event.type, timestamp: sentAt.toISOString(), data: event.data });
    const res = await fetch(`${apiUrl}/webhooks/dodo`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': id,
        'webhook-timestamp': Math.floor(sentAt.getTime() / 1000).toString(),
        'webhook-signature': signer.sign(id, sentAt, body),
      },
      body,
    });
    console.log(`${event.type.padEnd(28)} -> ${res.status} ${await res.text()}`);
  }
}

main()
  .catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
