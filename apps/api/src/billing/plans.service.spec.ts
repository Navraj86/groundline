import type { Plan } from '../generated/prisma/client.js';
import { currentPeriodStart } from './entitlements.service.js';
import { planLimits, toPlanInfo } from './plans.service.js';

const basePlan: Plan = {
  id: '0192f0a0-0000-7000-8000-000000000000',
  key: 'starter',
  name: 'Starter',
  description: 'Small teams',
  priceCents: 2900,
  currency: 'USD',
  interval: 'month',
  dodoProductId: 'pdt_123',
  limits: { members: 5, knowledgeSources: 50, monthlyMessages: -1 },
  features: ['5 team members'],
  isPublic: true,
  isActive: true,
  sortOrder: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('plan helpers', () => {
  it('reads limits, keeping -1 as unlimited', () => {
    expect(planLimits(basePlan)).toEqual({ members: 5, knowledgeSources: 50, monthlyMessages: -1 });
  });

  it('treats missing or malformed limits as zero, never unlimited', () => {
    expect(planLimits({ limits: { members: 'lots' } })).toEqual({ members: 0, knowledgeSources: 0, monthlyMessages: 0 });
    expect(planLimits({ limits: null })).toEqual({ members: 0, knowledgeSources: 0, monthlyMessages: 0 });
  });

  it('marks paid plans without a payment product as not purchasable', () => {
    expect(toPlanInfo(basePlan).purchasable).toBe(true);
    expect(toPlanInfo({ ...basePlan, dodoProductId: null }).purchasable).toBe(false);
    expect(toPlanInfo({ ...basePlan, priceCents: 0, dodoProductId: null }).purchasable).toBe(true);
  });

  it('keys monthly usage by the first day of the UTC month', () => {
    expect(currentPeriodStart(new Date('2026-11-30T23:59:59Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(currentPeriodStart(new Date('2027-01-01T00:00:00Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
