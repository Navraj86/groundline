import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  ENTITLED_STATUSES,
  PLAN_LIMIT_LABELS,
  UNLIMITED,
  type PlanLimitKey,
  type UsageItem,
} from '@groundline/shared';
import type { Plan, Prisma, Subscription } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { planLimits, PlansService } from './plans.service.js';

type Db = PrismaService | Prisma.TransactionClient;

/** Thrown when an action would exceed the organization's plan. Mapped to 402 Payment Required. */
export class PlanLimitException extends HttpException {
  constructor(metric: PlanLimitKey, limit: number, message?: string) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        code: 'plan_limit_reached',
        metric,
        limit,
        message:
          message ??
          `Your plan includes ${limit} ${PLAN_LIMIT_LABELS[metric].toLowerCase()}. Upgrade to add more.`,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

export interface EffectivePlan {
  plan: Plan;
  /** The subscription row, even when it no longer grants its plan (e.g. on hold). */
  subscription: (Subscription & { plan: Plan }) | null;
}

/** First day of the current UTC month, the period key for monthly usage counters. */
export function currentPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Decides which plan applies to an organization and enforces its limits (BR-009).
 */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
  ) {}

  async effectivePlan(organizationId: string, db: Db = this.prisma): Promise<EffectivePlan> {
    const subscription = await db.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });
    if (subscription && ENTITLED_STATUSES.includes(subscription.status)) {
      return { plan: subscription.plan, subscription };
    }
    return { plan: await this.plans.free(), subscription };
  }

  async usage(organizationId: string): Promise<Record<PlanLimitKey, UsageItem>> {
    const { plan } = await this.effectivePlan(organizationId);
    const limits = planLimits(plan);
    const [members, knowledgeSources, monthlyMessages] = await Promise.all([
      this.prisma.organizationMember.count({ where: { organizationId } }),
      this.prisma.knowledgeSource.count({ where: { organizationId } }),
      this.counter(organizationId, 'monthlyMessages'),
    ]);
    return {
      members: { used: members, limit: limits.members },
      knowledgeSources: { used: knowledgeSources, limit: limits.knowledgeSources },
      monthlyMessages: { used: monthlyMessages, limit: limits.monthlyMessages },
    };
  }

  /**
   * Checks there is room for one more member. Pending invitations count as seats, except a
   * pending invitation for `email` itself, which re-inviting replaces.
   */
  async assertCanInvite(organizationId: string, email: string, db: Db = this.prisma): Promise<void> {
    const { plan } = await this.effectivePlan(organizationId, db);
    const limit = planLimits(plan).members;
    if (limit === UNLIMITED) return;

    const [members, pending] = await Promise.all([
      db.organizationMember.count({ where: { organizationId } }),
      db.invitation.count({
        where: { organizationId, status: 'PENDING', expiresAt: { gt: new Date() }, NOT: { email } },
      }),
    ]);
    if (members + pending >= limit) {
      throw new PlanLimitException(
        'members',
        limit,
        `Your ${plan.name} plan includes ${limit} team members, counting pending invitations. Upgrade to invite more people.`,
      );
    }
  }

  /** Checks a member can join (invitations accepted after a downgrade may no longer fit). */
  async assertCanJoin(organizationId: string, db: Db = this.prisma): Promise<void> {
    const { plan } = await this.effectivePlan(organizationId, db);
    const limit = planLimits(plan).members;
    if (limit === UNLIMITED) return;
    const members = await db.organizationMember.count({ where: { organizationId } });
    if (members >= limit) {
      throw new PlanLimitException(
        'members',
        limit,
        'This workspace has reached its team size limit. Ask a workspace owner to upgrade the plan.',
      );
    }
  }

  async assertCanAddKnowledgeSource(organizationId: string): Promise<void> {
    const { plan } = await this.effectivePlan(organizationId);
    const limit = planLimits(plan).knowledgeSources;
    if (limit === UNLIMITED) return;
    const count = await this.prisma.knowledgeSource.count({ where: { organizationId } });
    if (count >= limit) {
      throw new PlanLimitException(
        'knowledgeSources',
        limit,
        `Your ${plan.name} plan includes ${limit} knowledge sources. Remove one or upgrade to add more.`,
      );
    }
  }

  /** Atomically records metered usage after checking the monthly limit. */
  async consume(organizationId: string, metric: 'monthlyMessages', amount = 1): Promise<void> {
    const { plan } = await this.effectivePlan(organizationId);
    const limit = planLimits(plan)[metric];
    if (limit !== UNLIMITED && amount > limit) throw new PlanLimitException(metric, limit);
    const periodStart = currentPeriodStart();

    // Increment only while under the limit, in a single statement, so concurrent requests
    // can't overshoot it.
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO usage_counters (organization_id, metric, period_start, count, updated_at)
      VALUES (${organizationId}::uuid, ${metric}, ${periodStart}::date, ${amount}, now())
      ON CONFLICT (organization_id, metric, period_start)
      DO UPDATE SET count = usage_counters.count + ${amount}, updated_at = now()
        WHERE ${limit} = ${UNLIMITED} OR usage_counters.count + ${amount} <= ${limit}
      RETURNING count`;
    if (rows.length === 0) throw new PlanLimitException(metric, limit);
  }

  private async counter(organizationId: string, metric: string): Promise<number> {
    const row = await this.prisma.usageCounter.findUnique({
      where: {
        organizationId_metric_periodStart: { organizationId, metric, periodStart: currentPeriodStart() },
      },
    });
    return row?.count ?? 0;
  }
}
