import { Injectable, Logger } from '@nestjs/common';
import { ENTITLED_STATUSES } from '@groundline/shared';
import type { Payment as DodoPayment, Subscription as DodoSubscription } from 'dodopayments/resources';
import { AuditService } from '../audit/audit.service.js';
import { Prisma, type SubscriptionStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlansService } from './plans.service.js';

type Tx = Prisma.TransactionClient;

export type SyncOutcome =
  | { applied: true; organizationId: string }
  | { applied: false; organizationId: string | null; reason: string };

const STATUS_MAP: Record<DodoSubscription['status'], SubscriptionStatus> = {
  pending: 'PENDING',
  active: 'ACTIVE',
  past_due: 'PAST_DUE',
  on_hold: 'ON_HOLD',
  paused: 'PAUSED',
  cancelled: 'CANCELLED',
  failed: 'FAILED',
  expired: 'EXPIRED',
};

/**
 * Projects Dodo Payments subscription and payment objects onto our tables. Used by the
 * webhook processor and by on-demand reconciliation, so both paths behave the same way.
 */
@Injectable()
export class SubscriptionSyncService {
  private readonly logger = new Logger(SubscriptionSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly audit: AuditService,
  ) {}

  async applySubscription(data: DodoSubscription, occurredAt: Date, tx: Tx): Promise<SyncOutcome> {
    const organizationId = await this.resolveOrganization(tx, {
      metadata: data.metadata,
      subscriptionId: data.subscription_id,
      customerId: data.customer?.customer_id,
    });
    if (!organizationId) return { applied: false, organizationId: null, reason: 'unknown organization' };

    const plan = await this.plans.findByProductId(data.product_id);
    if (!plan) return { applied: false, organizationId, reason: `no plan for product ${data.product_id}` };

    const status = STATUS_MAP[data.status];
    const existing = await tx.subscription.findUnique({ where: { organizationId } });

    if (existing) {
      const sameSubscription = existing.dodoSubscriptionId === data.subscription_id;
      // Deliveries can arrive out of order; never let an older state overwrite a newer one.
      if (sameSubscription && existing.lastEventAt && occurredAt < existing.lastEventAt) {
        return { applied: false, organizationId, reason: 'stale event' };
      }
      // A late event about a previous subscription must not displace the current one.
      if (!sameSubscription && ENTITLED_STATUSES.includes(existing.status) && !ENTITLED_STATUSES.includes(status)) {
        return { applied: false, organizationId, reason: 'event for a superseded subscription' };
      }
    }

    const values = {
      planId: plan.id,
      status,
      dodoSubscriptionId: data.subscription_id,
      dodoCustomerId: data.customer?.customer_id ?? null,
      currentPeriodStart: toDate(data.previous_billing_date),
      currentPeriodEnd: toDate(data.next_billing_date),
      cancelAtPeriodEnd: data.cancel_at_next_billing_date,
      cancelledAt: toDate(data.cancelled_at),
      pastDueEndsAt: toDate((data as { past_due_ends_at?: string | null }).past_due_ends_at),
      lastEventAt: occurredAt,
    };
    await tx.subscription.upsert({
      where: { organizationId },
      create: { organizationId, ...values },
      update: values,
    });

    if (data.customer?.customer_id) {
      await tx.organization.updateMany({
        where: { id: organizationId, dodoCustomerId: null },
        data: { dodoCustomerId: data.customer.customer_id },
      });
    }

    const changed =
      !existing ||
      existing.status !== status ||
      existing.planId !== plan.id ||
      existing.cancelAtPeriodEnd !== values.cancelAtPeriodEnd;
    if (changed) {
      await this.audit.record(
        {
          organizationId,
          action: 'subscription.updated',
          targetType: 'subscription',
          targetId: data.subscription_id,
          metadata: {
            plan: plan.key,
            status,
            previousStatus: existing?.status ?? null,
            cancelAtPeriodEnd: values.cancelAtPeriodEnd,
          },
        },
        tx,
      );
    }
    return { applied: true, organizationId };
  }

  async applyPayment(data: DodoPayment, occurredAt: Date, tx: Tx): Promise<SyncOutcome> {
    const subscriptionId = data.subscription_id ?? data.subscription_ids?.[0] ?? null;
    const organizationId = await this.resolveOrganization(tx, {
      metadata: data.metadata,
      subscriptionId,
      customerId: data.customer?.customer_id,
    });
    if (!organizationId) return { applied: false, organizationId: null, reason: 'unknown organization' };

    const existing = await tx.payment.findUnique({ where: { dodoPaymentId: data.payment_id } });
    if (existing?.lastEventAt && occurredAt < existing.lastEventAt) {
      return { applied: false, organizationId, reason: 'stale event' };
    }

    const values = {
      organizationId,
      dodoSubscriptionId: subscriptionId,
      amountCents: data.total_amount,
      currency: data.currency,
      status: data.status ?? 'unknown',
      chargeType: data.charge_type ?? null,
      invoiceUrl: data.invoice_url ?? null,
      providerCreatedAt: new Date(data.created_at),
      lastEventAt: occurredAt,
    };
    await tx.payment.upsert({
      where: { dodoPaymentId: data.payment_id },
      create: { dodoPaymentId: data.payment_id, ...values },
      update: values,
    });
    return { applied: true, organizationId };
  }

  /**
   * Finds the organization an event belongs to: checkout metadata first, then the
   * subscription we already track, then the organization's customer id.
   */
  private async resolveOrganization(
    tx: Tx,
    ref: { metadata?: Record<string, string | number | boolean> | null; subscriptionId?: string | null; customerId?: string | null },
  ): Promise<string | null> {
    const fromMetadata = ref.metadata?.organization_id;
    if (typeof fromMetadata === 'string' && /^[0-9a-f-]{36}$/i.test(fromMetadata)) {
      const org = await tx.organization.findUnique({ where: { id: fromMetadata }, select: { id: true } });
      if (org) return org.id;
      this.logger.warn(`Event references missing organization ${fromMetadata}`);
    }
    if (ref.subscriptionId) {
      const sub = await tx.subscription.findUnique({
        where: { dodoSubscriptionId: ref.subscriptionId },
        select: { organizationId: true },
      });
      if (sub) return sub.organizationId;
    }
    if (ref.customerId) {
      const org = await tx.organization.findUnique({ where: { dodoCustomerId: ref.customerId }, select: { id: true } });
      if (org) return org.id;
    }
    return null;
  }

  runInTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}
