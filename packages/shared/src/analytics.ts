import { z } from 'zod';
import type { TicketSource, TicketStatus } from './tickets.js';

/** Longest range a report may cover, in days. */
export const ANALYTICS_MAX_DAYS = 366;

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Inclusive calendar-date range, interpreted in `tz`. */
export const analyticsQuerySchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    tz: z.string().max(64).refine(isTimeZone, 'Unknown time zone').default('UTC'),
  })
  .refine((q) => q.from <= q.to, { message: '"from" must not be after "to"', path: ['from'] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 < ANALYTICS_MAX_DAYS, {
    message: `Choose a range of at most ${ANALYTICS_MAX_DAYS} days`,
    path: ['from'],
  });
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export interface LatencyStats {
  avgMs: number | null;
  p50Ms: number | null;
  p90Ms: number | null;
}

export interface ModelUsage {
  provider: string | null;
  model: string;
  replies: number;
  inputTokens: number;
  outputTokens: number;
  /** Null when the model has no known price. */
  costUsd: number | null;
}

export interface ToolStats {
  tool: string;
  total: number;
  succeeded: number;
  failed: number;
  blocked: number;
  pendingApproval: number;
  rejected: number;
  /** Succeeded ÷ calls that actually ran (succeeded + failed). Null when none ran. */
  successRate: number | null;
}

export interface FlaggedAnswer {
  messageId: string;
  conversationId: string;
  excerpt: string;
  groundedness: number;
  unsupportedClaims: string[];
  createdAt: string;
}

export interface DailyPoint {
  /** YYYY-MM-DD in the report's time zone. */
  date: string;
  conversations: number;
  escalated: number;
  aiReplies: number;
  tickets: number;
}

/**
 * Support analytics for a date range (FR-057 – FR-062). Conversation figures cover the
 * website widget only; usage and cost include playground tests, which cost the same.
 */
export interface AnalyticsReport {
  range: { from: string; to: string; tz: string; days: number };
  conversations: {
    total: number;
    customerMessages: number;
    /** Conversations the assistant replied to. */
    aiEngaged: number;
    /** Engaged and never handed to the team. */
    aiResolved: number;
    escalated: number;
    /** aiResolved ÷ aiEngaged. */
    resolutionRate: number | null;
  };
  answers: {
    total: number;
    answered: number;
    insufficientContext: number;
    error: number;
    latency: LatencyStats;
  };
  tickets: {
    created: number;
    resolved: number;
    /** Open or in progress right now, regardless of range. */
    openNow: number;
    bySource: Record<TicketSource, number>;
    /** Current status of the tickets created in the range. */
    byStatus: Record<TicketStatus, number>;
    medianResolutionHours: number | null;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** Tokens spent on background quality reviews and evaluation runs. */
    qualityTokens: number;
    estimatedCostUsd: number;
    /** True when some usage came from models without a known price. */
    costIncomplete: boolean;
    byModel: ModelUsage[];
  };
  agent: {
    runs: number;
    failed: number;
    avgSteps: number | null;
    tools: ToolStats[];
    approvals: { pending: number; approved: number; rejected: number; expired: number; medianDecisionMinutes: number | null };
  };
  quality: {
    reviewed: number;
    avgGroundedness: number | null;
    avgRelevance: number | null;
    flagged: number;
    recentFlagged: FlaggedAnswer[];
  };
  daily: DailyPoint[];
}
