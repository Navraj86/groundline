import type { PrismaService } from '../src/prisma/prisma.service.js';

/** The Free plan as seeded, so tests don't depend on which spec file runs first. */
export const FREE_PLAN = {
  key: 'free',
  name: 'Free',
  description: 'Try Groundline with a small team and knowledge base.',
  priceCents: 0,
  limits: { members: 2, knowledgeSources: 5, monthlyMessages: 100 },
  features: [],
};

export async function ensureFreePlan(prisma: PrismaService): Promise<void> {
  await prisma.plan.upsert({ where: { key: 'free' }, create: FREE_PLAN, update: { limits: FREE_PLAN.limits } });
}
