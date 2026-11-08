import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GROUNDEDNESS_FLAG_THRESHOLD,
  type AnalyticsQuery,
  type AnalyticsReport,
  type DailyPoint,
  type ModelUsage,
  type TicketSource,
  type TicketStatus,
  type ToolStats,
} from '@groundline/shared';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CacheService } from '../queue/cache.service.js';
import { DEFAULT_MODEL_PRICES, parsePriceOverrides, PriceList } from './pricing.js';

/** Reports are cached briefly so dashboards stay fast without going noticeably stale. */
const CACHE_SECONDS = 60;

type Row = Record<string, unknown>;
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const round = (v: number | null, digits = 3): number | null => (v === null ? null : Number(v.toFixed(digits)));

@Injectable()
export class AnalyticsService {
  private readonly prices: PriceList;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    config: ConfigService<Env, true>,
  ) {
    this.prices = new PriceList({
      ...DEFAULT_MODEL_PRICES,
      ...parsePriceOverrides(config.get('AI_MODEL_PRICES', { infer: true })),
    });
  }

  report(organizationId: string, query: AnalyticsQuery): Promise<AnalyticsReport> {
    const key = `analytics:${organizationId}:${query.from}:${query.to}:${query.tz}`;
    return this.cache.getOrSet(key, CACHE_SECONDS, () => this.build(organizationId, query));
  }

  private async build(org: string, q: AnalyticsQuery): Promise<AnalyticsReport> {
    // Range boundaries: local midnight at the start of `from` to local midnight after `to`.
    const [bounds] = await this.prisma.$queryRaw<{ start: Date; end: Date }[]>`
      SELECT (${q.from}::date::timestamp AT TIME ZONE ${q.tz}) AS start,
             ((${q.to}::date + 1)::timestamp AT TIME ZONE ${q.tz}) AS "end"`;
    const { start, end } = bounds!;
    const day = (col: string) => Prisma.raw(`to_char((${col} AT TIME ZONE '${q.tz.replace(/'/g, "''")}')::date, 'YYYY-MM-DD')`);

    const [conv, customerMessages, answers, tickets, ticketGroups, openNow, models, qualityUsage, runs, tools, approvals, quality, flagged, daily] =
      await Promise.all([
        this.one`
          SELECT count(*) AS total,
                 count(*) FILTER (WHERE ai_engaged_at IS NOT NULL) AS engaged,
                 count(*) FILTER (WHERE ai_engaged_at IS NOT NULL AND escalated_at IS NULL) AS resolved,
                 count(*) FILTER (WHERE escalated_at IS NOT NULL) AS escalated
            FROM conversations
           WHERE organization_id = ${org}::uuid AND channel = 'WIDGET'
             AND created_at >= ${start} AND created_at < ${end}`,
        this.one`
          SELECT count(*) AS n
            FROM messages m JOIN conversations c ON c.id = m.conversation_id
           WHERE m.organization_id = ${org}::uuid AND c.channel = 'WIDGET' AND m.role = 'CUSTOMER'
             AND m.created_at >= ${start} AND m.created_at < ${end}`,
        this.one`
          SELECT count(*) AS total,
                 count(*) FILTER (WHERE m.answer_status = 'ANSWERED') AS answered,
                 count(*) FILTER (WHERE m.answer_status = 'INSUFFICIENT_CONTEXT') AS insufficient,
                 count(*) FILTER (WHERE m.answer_status = 'ERROR') AS error,
                 avg(r.latency_ms) AS avg,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY r.latency_ms) AS p50,
                 percentile_cont(0.9) WITHIN GROUP (ORDER BY r.latency_ms) AS p90
            FROM agent_runs r
            JOIN messages m ON m.id = r.message_id
            JOIN conversations c ON c.id = r.conversation_id
           WHERE r.organization_id = ${org}::uuid AND c.channel = 'WIDGET'
             AND r.created_at >= ${start} AND r.created_at < ${end}`,
        this.one`
          SELECT (SELECT count(*) FROM tickets WHERE organization_id = ${org}::uuid
                     AND created_at >= ${start} AND created_at < ${end}) AS created,
                 count(*) AS resolved,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM resolved_at - created_at) / 3600) AS median_hours
            FROM tickets
           WHERE organization_id = ${org}::uuid AND resolved_at >= ${start} AND resolved_at < ${end}`,
        this.many`
          SELECT source::text AS source, status::text AS status, count(*) AS n
            FROM tickets
           WHERE organization_id = ${org}::uuid AND created_at >= ${start} AND created_at < ${end}
           GROUP BY 1, 2`,
        this.one`
          SELECT count(*) AS n FROM tickets
           WHERE organization_id = ${org}::uuid AND status IN ('OPEN', 'IN_PROGRESS')`,
        this.many`
          SELECT provider, model, count(*) AS replies,
                 sum(input_tokens) AS input, sum(output_tokens) AS output
            FROM agent_runs
           WHERE organization_id = ${org}::uuid AND model IS NOT NULL
             AND created_at >= ${start} AND created_at < ${end}
           GROUP BY 1, 2
           ORDER BY sum(input_tokens) + sum(output_tokens) DESC`,
        // Review and evaluation tokens aren't split into input/output; nearly all are input.
        this.many`
          SELECT judge, sum(tokens) AS tokens FROM (
            SELECT review_judge AS judge, review_tokens AS tokens
              FROM messages
             WHERE organization_id = ${org}::uuid AND review_tokens IS NOT NULL
               AND reviewed_at >= ${start} AND reviewed_at < ${end}
          ) t GROUP BY 1`,
        this.one`
          SELECT count(*) AS runs, count(*) FILTER (WHERE status = 'FAILED') AS failed, avg(steps) AS avg_steps
            FROM agent_runs
           WHERE organization_id = ${org}::uuid AND created_at >= ${start} AND created_at < ${end}`,
        this.many`
          SELECT tool, status::text AS status, count(*) AS n
            FROM tool_calls
           WHERE organization_id = ${org}::uuid AND created_at >= ${start} AND created_at < ${end}
           GROUP BY 1, 2`,
        this.one`
          SELECT count(*) FILTER (WHERE status = 'PENDING') AS pending,
                 count(*) FILTER (WHERE status = 'APPROVED') AS approved,
                 count(*) FILTER (WHERE status = 'REJECTED') AS rejected,
                 count(*) FILTER (WHERE status = 'EXPIRED') AS expired,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM decided_at - created_at) / 60)
                   FILTER (WHERE decided_at IS NOT NULL) AS median_minutes
            FROM approval_requests
           WHERE organization_id = ${org}::uuid AND created_at >= ${start} AND created_at < ${end}`,
        this.one`
          SELECT count(*) AS reviewed, avg(groundedness) AS groundedness, avg(relevance) AS relevance,
                 count(*) FILTER (WHERE groundedness < ${GROUNDEDNESS_FLAG_THRESHOLD}) AS flagged
            FROM messages
           WHERE organization_id = ${org}::uuid AND reviewed_at IS NOT NULL
             AND created_at >= ${start} AND created_at < ${end}`,
        this.many`
          SELECT id, conversation_id, left(content, 240) AS excerpt, groundedness, unsupported_claims, created_at
            FROM messages
           WHERE organization_id = ${org}::uuid AND groundedness < ${GROUNDEDNESS_FLAG_THRESHOLD}
             AND created_at >= ${start} AND created_at < ${end}
           ORDER BY created_at DESC
           LIMIT 5`,
        Promise.all([
          this.many`
            SELECT ${day('created_at')} AS d, count(*) AS n,
                   count(*) FILTER (WHERE escalated_at IS NOT NULL) AS escalated
              FROM conversations
             WHERE organization_id = ${org}::uuid AND channel = 'WIDGET'
               AND created_at >= ${start} AND created_at < ${end}
             GROUP BY 1`,
          this.many`
            SELECT ${day('r.created_at')} AS d, count(*) AS n
              FROM agent_runs r JOIN conversations c ON c.id = r.conversation_id
             WHERE r.organization_id = ${org}::uuid AND c.channel = 'WIDGET'
               AND r.created_at >= ${start} AND r.created_at < ${end}
             GROUP BY 1`,
          this.many`
            SELECT ${day('created_at')} AS d, count(*) AS n
              FROM tickets
             WHERE organization_id = ${org}::uuid AND created_at >= ${start} AND created_at < ${end}
             GROUP BY 1`,
        ]),
      ]);

    // ---- Usage and cost -------------------------------------------------------------------
    let estimatedCostUsd = 0;
    let costIncomplete = false;
    const byModel: ModelUsage[] = models.map((m) => {
      const inputTokens = num(m.input);
      const outputTokens = num(m.output);
      const costUsd = this.prices.cost(String(m.model), inputTokens, outputTokens);
      if (costUsd === null) costIncomplete = true;
      else estimatedCostUsd += costUsd;
      return {
        provider: (m.provider as string | null) ?? null,
        model: String(m.model),
        replies: num(m.replies),
        inputTokens,
        outputTokens,
        costUsd: round(costUsd, 4),
      };
    });
    let qualityTokens = 0;
    for (const row of qualityUsage) {
      const tokens = num(row.tokens);
      qualityTokens += tokens;
      const model = String(row.judge ?? '').split(':').pop() ?? '';
      if (row.judge === 'heuristic') continue;
      const cost = this.prices.cost(model, tokens, 0);
      if (cost === null) costIncomplete = true;
      else estimatedCostUsd += cost;
    }

    // ---- Tickets ----------------------------------------------------------------------
    const bySource: Record<TicketSource, number> = { AI: 0, CUSTOMER: 0, AGENT: 0 };
    const byStatus: Record<TicketStatus, number> = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0 };
    for (const g of ticketGroups) {
      bySource[g.source as TicketSource] += num(g.n);
      byStatus[g.status as TicketStatus] += num(g.n);
    }

    // ---- Tools ----------------------------------------------------------------------
    const toolMap = new Map<string, ToolStats>();
    for (const t of tools) {
      const name = String(t.tool);
      const s = toolMap.get(name) ?? {
        tool: name,
        total: 0,
        succeeded: 0,
        failed: 0,
        blocked: 0,
        pendingApproval: 0,
        rejected: 0,
        successRate: null,
      };
      const n = num(t.n);
      s.total += n;
      const key = ({ SUCCEEDED: 'succeeded', FAILED: 'failed', BLOCKED: 'blocked', PENDING_APPROVAL: 'pendingApproval', REJECTED: 'rejected' } as const)[
        t.status as 'SUCCEEDED'
      ];
      if (key) s[key] += n;
      toolMap.set(name, s);
    }
    const toolStats = [...toolMap.values()]
      .map((s) => ({ ...s, successRate: s.succeeded + s.failed ? round(s.succeeded / (s.succeeded + s.failed)) : null }))
      .sort((a, b) => b.total - a.total);

    // ---- Daily series -----------------------------------------------------------------
    const [convDays, replyDays, ticketDays] = daily;
    const series = new Map<string, DailyPoint>();
    for (let d = new Date(`${q.from}T00:00:00Z`); d <= new Date(`${q.to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const date = d.toISOString().slice(0, 10);
      series.set(date, { date, conversations: 0, escalated: 0, aiReplies: 0, tickets: 0 });
    }
    for (const r of convDays) {
      const p = series.get(String(r.d));
      if (p) {
        p.conversations = num(r.n);
        p.escalated = num(r.escalated);
      }
    }
    for (const r of replyDays) {
      const p = series.get(String(r.d));
      if (p) p.aiReplies = num(r.n);
    }
    for (const r of ticketDays) {
      const p = series.get(String(r.d));
      if (p) p.tickets = num(r.n);
    }

    const engaged = num(conv.engaged);
    return {
      range: { from: q.from, to: q.to, tz: q.tz, days: series.size },
      conversations: {
        total: num(conv.total),
        customerMessages: num(customerMessages.n),
        aiEngaged: engaged,
        aiResolved: num(conv.resolved),
        escalated: num(conv.escalated),
        resolutionRate: engaged ? round(num(conv.resolved) / engaged) : null,
      },
      answers: {
        total: num(answers.total),
        answered: num(answers.answered),
        insufficientContext: num(answers.insufficient),
        error: num(answers.error),
        latency: {
          avgMs: round(numOrNull(answers.avg), 0),
          p50Ms: round(numOrNull(answers.p50), 0),
          p90Ms: round(numOrNull(answers.p90), 0),
        },
      },
      tickets: {
        created: num(tickets.created),
        resolved: num(tickets.resolved),
        openNow: num(openNow.n),
        bySource,
        byStatus,
        medianResolutionHours: round(numOrNull(tickets.median_hours), 1),
      },
      usage: {
        inputTokens: byModel.reduce((s, m) => s + m.inputTokens, 0),
        outputTokens: byModel.reduce((s, m) => s + m.outputTokens, 0),
        qualityTokens,
        estimatedCostUsd: round(estimatedCostUsd, 4) ?? 0,
        costIncomplete,
        byModel,
      },
      agent: {
        runs: num(runs.runs),
        failed: num(runs.failed),
        avgSteps: round(numOrNull(runs.avg_steps), 2),
        tools: toolStats,
        approvals: {
          pending: num(approvals.pending),
          approved: num(approvals.approved),
          rejected: num(approvals.rejected),
          expired: num(approvals.expired),
          medianDecisionMinutes: round(numOrNull(approvals.median_minutes), 1),
        },
      },
      quality: {
        reviewed: num(quality.reviewed),
        avgGroundedness: round(numOrNull(quality.groundedness)),
        avgRelevance: round(numOrNull(quality.relevance)),
        flagged: num(quality.flagged),
        recentFlagged: flagged.map((f) => ({
          messageId: String(f.id),
          conversationId: String(f.conversation_id),
          excerpt: String(f.excerpt),
          groundedness: num(f.groundedness),
          unsupportedClaims: (f.unsupported_claims as string[] | null) ?? [],
          createdAt: (f.created_at as Date).toISOString(),
        })),
      },
      daily: [...series.values()],
    };
  }

  private async one(strings: TemplateStringsArray, ...values: unknown[]): Promise<Row> {
    const rows = await this.prisma.$queryRaw<Row[]>(strings, ...values);
    return rows[0] ?? {};
  }

  private many(strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]> {
    return this.prisma.$queryRaw<Row[]>(strings, ...values);
  }
}
