import { Injectable, NotFoundException } from '@nestjs/common';
import { PLAN_LIMIT_KEYS, type PlanInfo, type PlanLimits } from '@groundline/shared';
import type { Plan } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const FREE_PLAN_KEY = 'free';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(): Promise<PlanInfo[]> {
    const plans = await this.prisma.plan.findMany({
      where: { isPublic: true, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return plans.map(toPlanInfo);
  }

  async findByKey(key: string): Promise<Plan> {
    const plan = await this.prisma.plan.findFirst({ where: { key, isActive: true } });
    if (!plan) throw new NotFoundException(`Unknown plan "${key}"`);
    return plan;
  }

  async findByProductId(productId: string): Promise<Plan | null> {
    return this.prisma.plan.findUnique({ where: { dodoProductId: productId } });
  }

  async free(): Promise<Plan> {
    const plan = await this.prisma.plan.findUnique({ where: { key: FREE_PLAN_KEY } });
    if (!plan) throw new Error('The free plan is missing. Run `pnpm db:seed`.');
    return plan;
  }
}

export function planLimits(plan: Pick<Plan, 'limits'>): PlanLimits {
  const raw = (plan.limits ?? {}) as Partial<Record<string, unknown>>;
  const limits = {} as PlanLimits;
  for (const key of PLAN_LIMIT_KEYS) {
    const value = raw[key];
    // A missing limit is treated as zero, never as unlimited.
    limits[key] = typeof value === 'number' ? value : 0;
  }
  return limits;
}

export function toPlanInfo(plan: Plan): PlanInfo {
  return {
    key: plan.key,
    name: plan.name,
    description: plan.description,
    priceCents: plan.priceCents,
    currency: plan.currency,
    interval: plan.interval,
    limits: planLimits(plan),
    features: plan.features,
    purchasable: plan.priceCents === 0 || plan.dodoProductId !== null,
  };
}
