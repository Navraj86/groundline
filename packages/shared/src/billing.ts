import { z } from 'zod';

/** Resources that plans limit. A limit of -1 means unlimited. */
export const PLAN_LIMIT_KEYS = ['members', 'knowledgeSources', 'monthlyMessages'] as const;
export type PlanLimitKey = (typeof PLAN_LIMIT_KEYS)[number];
export type PlanLimits = Record<PlanLimitKey, number>;

export const PLAN_LIMIT_LABELS: Record<PlanLimitKey, string> = {
  members: 'Team members',
  knowledgeSources: 'Knowledge sources',
  monthlyMessages: 'AI conversations this month',
};

export const UNLIMITED = -1;

export const SUBSCRIPTION_STATUSES = [
  'PENDING',
  'ACTIVE',
  'PAST_DUE',
  'ON_HOLD',
  'PAUSED',
  'CANCELLED',
  'FAILED',
  'EXPIRED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Statuses in which the organization keeps its paid plan. PAST_DUE is the grace period. */
export const ENTITLED_STATUSES: readonly SubscriptionStatus[] = ['ACTIVE', 'PAST_DUE'];

export interface PlanInfo {
  key: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  interval: string;
  limits: PlanLimits;
  features: string[];
  /** False for paid plans that aren't connected to a payment product yet. */
  purchasable: boolean;
}

export interface SubscriptionInfo {
  planKey: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pastDueEndsAt: string | null;
}

export interface UsageItem {
  used: number;
  limit: number;
}

export interface BillingOverview {
  /** The plan whose limits currently apply (Free unless a paid subscription is entitled). */
  plan: PlanInfo;
  subscription: SubscriptionInfo | null;
  usage: Record<PlanLimitKey, UsageItem>;
  plans: PlanInfo[];
  /** False when no payment provider is configured, e.g. in local development. */
  billingEnabled: boolean;
}

export interface PaymentRecord {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  chargeType: string | null;
  invoiceUrl: string | null;
  createdAt: string;
}

export interface CheckoutResult {
  checkoutUrl: string;
}

export interface PortalResult {
  url: string;
}

export interface BillingActionResult {
  message: string;
}

export const planKeySchema = z.string().trim().min(1).max(40);
export const checkoutSchema = z.object({ planKey: planKeySchema });
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export const changePlanSchema = z.object({ planKey: planKeySchema });
export type ChangePlanInput = z.infer<typeof changePlanSchema>;

export function formatPrice(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function isUnlimited(limit: number): boolean {
  return limit === UNLIMITED;
}
