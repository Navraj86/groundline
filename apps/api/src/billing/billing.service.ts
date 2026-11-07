import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ENTITLED_STATUSES,
  type BillingActionResult,
  type BillingOverview,
  type CheckoutResult,
  type PaymentRecord,
  type PortalResult,
  type SubscriptionInfo,
} from '@groundline/shared';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import type { Env } from '../config/env.js';
import type { Plan, Subscription } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DodoService } from './dodo.service.js';
import { EntitlementsService } from './entitlements.service.js';
import { FREE_PLAN_KEY, PlansService, toPlanInfo } from './plans.service.js';
import { SubscriptionSyncService } from './subscription-sync.service.js';

type OrgRef = { organizationId: string };

@Injectable()
export class BillingService {
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly entitlements: EntitlementsService,
    private readonly dodo: DodoService,
    private readonly sync: SubscriptionSyncService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.webUrl = config.get('WEB_URL', { infer: true });
  }

  async overview({ organizationId }: OrgRef): Promise<BillingOverview> {
    const [{ plan, subscription }, usage, plans] = await Promise.all([
      this.entitlements.effectivePlan(organizationId),
      this.entitlements.usage(organizationId),
      this.plans.listPublic(),
    ]);
    return {
      plan: toPlanInfo(plan),
      subscription: subscription ? toSubscriptionInfo(subscription) : null,
      usage,
      plans,
      billingEnabled: this.dodo.enabled,
    };
  }

  async payments({ organizationId }: OrgRef): Promise<PaymentRecord[]> {
    const rows = await this.prisma.payment.findMany({
      where: { organizationId },
      orderBy: { providerCreatedAt: 'desc' },
      take: 50,
    });
    return rows.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      currency: p.currency,
      status: p.status,
      chargeType: p.chargeType,
      invoiceUrl: p.invoiceUrl,
      createdAt: p.providerCreatedAt.toISOString(),
    }));
  }

  /** Starts a hosted Dodo checkout for a paid plan (workflow 7.2). */
  async checkout({ organizationId }: OrgRef, user: AuthContext, planKey: string): Promise<CheckoutResult> {
    const plan = await this.plans.findByKey(planKey);
    if (!plan.dodoProductId) throw new BadRequestException(`The ${plan.name} plan can't be purchased online.`);

    const current = await this.prisma.subscription.findUnique({ where: { organizationId } });
    if (current && ENTITLED_STATUSES.includes(current.status) && current.dodoSubscriptionId) {
      throw new ConflictException('This workspace already has a subscription. Change its plan instead.');
    }

    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const customerId = org.dodoCustomerId ?? (await this.createCustomer(org, user));

    const session = await this.dodo.call('checkout', (c) =>
      c.checkoutSessions.create({
        product_cart: [{ product_id: plan.dodoProductId!, quantity: 1 }],
        customer: { customer_id: customerId },
        return_url: `${this.webUrl}/o/${org.slug}/billing?checkout=success`,
        cancel_url: `${this.webUrl}/o/${org.slug}/billing?checkout=cancelled`,
        // Lets webhooks find the organization even before we know the subscription id.
        metadata: { organization_id: organizationId, plan_key: plan.key },
      }),
    );
    if (!session.checkout_url) throw new BadRequestException('The payment provider did not return a checkout link.');

    await this.audit.record({
      organizationId,
      actorUserId: user.userId,
      action: 'billing.checkout_started',
      targetType: 'plan',
      targetId: plan.key,
      metadata: { plan: plan.key, sessionId: session.session_id },
    });
    return { checkoutUrl: session.checkout_url };
  }

  /** Upgrades or downgrades between paid plans; switching to Free cancels at period end. */
  async changePlan(ref: OrgRef, user: AuthContext, planKey: string): Promise<BillingActionResult> {
    if (planKey === FREE_PLAN_KEY) return this.cancel(ref, user);

    const subscription = await this.requireActiveSubscription(ref);
    const plan = await this.plans.findByKey(planKey);
    if (plan.id === subscription.planId) {
      throw new BadRequestException(`You're already on the ${plan.name} plan.`);
    }
    if (!plan.dodoProductId) throw new BadRequestException(`The ${plan.name} plan can't be purchased online.`);

    await this.dodo.call('changePlan', (c) =>
      c.subscriptions.changePlan(subscription.dodoSubscriptionId!, {
        product_id: plan.dodoProductId!,
        quantity: 1,
        // Charge (or credit) the price difference now; keep the old plan if the charge fails.
        proration_billing_mode: 'difference_immediately',
        on_payment_failure: 'prevent_change',
      }),
    );
    await this.audit.record({
      organizationId: ref.organizationId,
      actorUserId: user.userId,
      action: 'billing.plan_change_requested',
      targetType: 'subscription',
      targetId: subscription.dodoSubscriptionId ?? undefined,
      metadata: { from: subscription.plan.key, to: plan.key },
    });
    // The plan updates when the provider confirms the change by webhook.
    return { message: `Switching to ${plan.name}. Your plan updates as soon as the payment is confirmed.` };
  }

  async cancel(ref: OrgRef, user: AuthContext): Promise<BillingActionResult> {
    const subscription = await this.requireActiveSubscription(ref);
    await this.setCancelAtPeriodEnd(ref, user, subscription, true);
    return { message: 'Your subscription will end at the close of the current billing period.' };
  }

  async resume(ref: OrgRef, user: AuthContext): Promise<BillingActionResult> {
    const subscription = await this.requireActiveSubscription(ref);
    if (!subscription.cancelAtPeriodEnd) throw new BadRequestException('Your subscription is not scheduled to end.');
    await this.setCancelAtPeriodEnd(ref, user, subscription, false);
    return { message: 'Your subscription will continue to renew.' };
  }

  /** A link to Dodo's customer portal for payment methods and invoices. */
  async portal({ organizationId }: OrgRef): Promise<PortalResult> {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    if (!org.dodoCustomerId) throw new BadRequestException('This workspace has no billing account yet.');
    const session = await this.dodo.call('customerPortal', (c) =>
      c.customers.customerPortal.create(org.dodoCustomerId!, {
        return_url: `${this.webUrl}/o/${org.slug}/billing`,
      }),
    );
    return { url: session.link };
  }

  /**
   * Reconciles the organization's subscription with the provider. Used when the customer
   * returns from checkout, before the webhook may have arrived.
   */
  async reconcile({ organizationId }: OrgRef): Promise<BillingOverview> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: { subscription: true },
    });
    if (this.dodo.enabled && org.dodoCustomerId) {
      let subscriptionId = org.subscription?.dodoSubscriptionId ?? null;
      if (!subscriptionId) {
        const page = await this.dodo.call('listSubscriptions', (c) =>
          c.subscriptions.list({ customer_id: org.dodoCustomerId!, page_size: 10 }),
        );
        const newest = [...page.items].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        subscriptionId = newest?.subscription_id ?? null;
      }
      if (subscriptionId) {
        const remote = await this.dodo.call('retrieveSubscription', (c) => c.subscriptions.retrieve(subscriptionId!));
        await this.sync.runInTransaction((tx) => this.sync.applySubscription(remote, new Date(), tx));
      }
    }
    return this.overview({ organizationId });
  }

  private async setCancelAtPeriodEnd(
    { organizationId }: OrgRef,
    user: AuthContext,
    subscription: Subscription,
    cancel: boolean,
  ): Promise<void> {
    const updated = await this.dodo.call('updateSubscription', (c) =>
      c.subscriptions.update(subscription.dodoSubscriptionId!, {
        cancel_at_next_billing_date: cancel,
        ...(cancel ? { cancel_reason: 'cancelled_by_customer' as const } : {}),
      }),
    );
    // Apply the provider's response right away so the UI doesn't wait for the webhook.
    await this.sync.runInTransaction((tx) => this.sync.applySubscription(updated, new Date(), tx));
    await this.audit.record({
      organizationId,
      actorUserId: user.userId,
      action: cancel ? 'billing.cancellation_scheduled' : 'billing.cancellation_withdrawn',
      targetType: 'subscription',
      targetId: subscription.dodoSubscriptionId ?? undefined,
    });
  }

  private async requireActiveSubscription({ organizationId }: OrgRef): Promise<Subscription & { plan: Plan }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });
    if (!subscription?.dodoSubscriptionId || !ENTITLED_STATUSES.includes(subscription.status)) {
      throw new BadRequestException('This workspace has no active subscription.');
    }
    return subscription;
  }

  private async createCustomer(org: { id: string; name: string }, user: AuthContext): Promise<string> {
    const customer = await this.dodo.call('createCustomer', (c) =>
      c.customers.create({ email: user.email, name: org.name, metadata: { organization_id: org.id } }),
    );
    // Guarded update: if a concurrent checkout already stored a customer, keep that one.
    const { count } = await this.prisma.organization.updateMany({
      where: { id: org.id, dodoCustomerId: null },
      data: { dodoCustomerId: customer.customer_id },
    });
    if (count === 0) {
      const current = await this.prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
      return current.dodoCustomerId!;
    }
    return customer.customer_id;
  }
}

function toSubscriptionInfo(sub: Subscription & { plan: Plan }): SubscriptionInfo {
  return {
    planKey: sub.plan.key,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    pastDueEndsAt: sub.pastDueEndsAt?.toISOString() ?? null,
  };
}
