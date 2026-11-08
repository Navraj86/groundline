import { Controller, Get, Query } from '@nestjs/common';
import { analyticsQuerySchema, type AnalyticsQuery, type AnalyticsReport } from '@groundline/shared';
import type { OrgContext } from '../auth/auth.types.js';
import { CurrentOrg, OrgScoped } from '../organizations/org-access.js';
import { AnalyticsService } from './analytics.service.js';

@Controller('orgs/:orgId/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Support, AI and agent metrics for an inclusive date range (FR-057 – FR-062). */
  @Get()
  @OrgScoped('analytics:read')
  report(@CurrentOrg() org: OrgContext, @Query({ schema: analyticsQuerySchema }) query: AnalyticsQuery): Promise<AnalyticsReport> {
    return this.analytics.report(org.organizationId, query);
  }
}
