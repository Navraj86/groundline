import { createHash } from 'node:crypto';
import type { PrismaService } from '../../prisma/prisma.service.js';
import {
  ConnectorError,
  type CancelSubscriptionInput,
  type CommerceConnector,
  type CustomerIdentity,
  type RefundInput,
} from './connector.js';

const PLANS = [
  { name: 'Basic', priceCents: 900 },
  { name: 'Plus', priceCents: 1900 },
  { name: 'Premium', priceCents: 3900 },
];
const PRODUCTS = [
  { name: 'Wireless earbuds', priceCents: 7900 },
  { name: 'Phone case', priceCents: 1900 },
  { name: 'Charging dock', priceCents: 4900 },
  { name: 'USB-C cable (2 m)', priceCents: 1200 },
  { name: 'Laptop sleeve', priceCents: 3500 },
  { name: 'Smart plug (2-pack)', priceCents: 2900 },
];
const DAY = 24 * 60 * 60 * 1000;

/**
 * A built-in demo store so the agent's tools can be tried without connecting a real
 * backend. Data is generated deterministically per customer, and approved refunds and
 * cancellations (recorded as tool calls) are reflected in later lookups.
 */
export class SandboxConnector implements CommerceConnector {
  readonly kind = 'SANDBOX' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationId: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getCustomerProfile(customer: CustomerIdentity) {
    const r = this.random(customer, 'profile');
    const since = new Date(this.now().getTime() - (90 + Math.floor(r() * 700)) * DAY);
    return {
      id: customer.externalId,
      name: customer.name,
      email: customer.email,
      customerSince: since.toISOString().slice(0, 10),
      loyaltyTier: ['Member', 'Silver', 'Gold'][Math.floor(r() * 3)],
      lifetimeOrders: 3 + Math.floor(r() * 20),
    };
  }

  async getSubscription(customer: CustomerIdentity) {
    const r = this.random(customer, 'subscription');
    const plan = PLANS[Math.floor(r() * PLANS.length)]!;
    const renews = new Date(this.now().getTime() + (3 + Math.floor(r() * 25)) * DAY);
    const cancellation = await this.latest(customer, 'cancel_subscription');
    const atPeriodEnd = (cancellation?.input as { atPeriodEnd?: boolean } | undefined)?.atPeriodEnd ?? true;
    return {
      plan: plan.name,
      priceCents: plan.priceCents,
      currency: 'USD',
      interval: 'month',
      status: cancellation ? (atPeriodEnd ? 'active_until_period_end' : 'canceled') : 'active',
      renewsOn: cancellation ? null : renews.toISOString().slice(0, 10),
      endsOn: cancellation && atPeriodEnd ? renews.toISOString().slice(0, 10) : null,
    };
  }

  async listOrders(customer: CustomerIdentity) {
    const r = this.random(customer, 'orders');
    const refunds = await this.prisma.toolCall.findMany({
      where: { organizationId: this.organizationId, tool: 'request_refund', status: 'SUCCEEDED', conversation: { customerId: customer.customerId } },
      select: { input: true },
    });
    const refunded = new Map(refunds.map((t) => [(t.input as { orderId: string }).orderId, t.input as unknown as RefundInput]));
    const statuses = ['delivered', 'delivered', 'shipped', 'processing'];
    return Array.from({ length: 3 }, (_, i) => {
      const product = PRODUCTS[Math.floor(r() * PRODUCTS.length)]!;
      const quantity = 1 + Math.floor(r() * 2);
      const placed = new Date(this.now().getTime() - (i * 18 + 2 + Math.floor(r() * 10)) * DAY);
      const id = `ORD-${createHash('sha256').update(`${customer.externalId}:${i}`).digest('hex').slice(0, 6).toUpperCase()}`;
      const totalCents = product.priceCents * quantity;
      const refund = refunded.get(id);
      return {
        id,
        placedOn: placed.toISOString().slice(0, 10),
        items: [{ name: product.name, quantity, unitPriceCents: product.priceCents }],
        totalCents,
        currency: 'USD',
        status: refund ? 'refunded' : statuses[Math.min(i + Math.floor(r() * 2), statuses.length - 1)],
        refundedCents: refund ? (refund.amountCents ?? totalCents) : 0,
      };
    });
  }

  async requestRefund(customer: CustomerIdentity, input: RefundInput) {
    const orders = (await this.listOrders(customer)) as { id: string; totalCents: number; status: string; refundedCents: number }[];
    const order = orders.find((o) => o.id === input.orderId);
    if (!order) throw new ConnectorError(`Order ${input.orderId} doesn't belong to this customer.`);
    if (order.status === 'refunded') throw new ConnectorError(`Order ${order.id} has already been refunded.`);
    const amountCents = input.amountCents ?? order.totalCents;
    if (amountCents > order.totalCents) throw new ConnectorError('The refund is larger than the order total.');
    return { refundId: `RF-${order.id.slice(4)}`, orderId: order.id, amountCents, currency: 'USD', status: 'refunded' };
  }

  async cancelSubscription(customer: CustomerIdentity, input: CancelSubscriptionInput) {
    const sub = (await this.getSubscription(customer)) as { status: string; renewsOn: string | null; plan: string };
    if (sub.status !== 'active') throw new ConnectorError('This subscription is already cancelled.');
    return {
      plan: sub.plan,
      status: input.atPeriodEnd ? 'active_until_period_end' : 'canceled',
      endsOn: input.atPeriodEnd ? sub.renewsOn : this.now().toISOString().slice(0, 10),
    };
  }

  private latest(customer: CustomerIdentity, tool: string) {
    return this.prisma.toolCall.findFirst({
      where: { organizationId: this.organizationId, tool, status: 'SUCCEEDED', conversation: { customerId: customer.customerId } },
      orderBy: { completedAt: 'desc' },
      select: { input: true },
    });
  }

  /** A seeded generator, so the same customer always sees the same demo data. */
  private random(customer: CustomerIdentity, salt: string): () => number {
    let seed = createHash('sha256').update(`${this.organizationId}:${customer.externalId}:${salt}`).digest().readUInt32BE(0);
    return () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}
