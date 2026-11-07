import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  type AuditLogEntry,
  type CreateOrganizationInput,
  type Organization,
  type OrganizationOverview,
  type Paginated,
  type UpdateOrganizationInput,
} from '@groundline/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext, OrgContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { CurrentOrg, OrgScoped } from './org-access.js';
import { OrganizationsService } from './organizations.service.js';

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

@Controller('orgs')
export class OrganizationsController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthContext,
    @Body({ schema: createOrganizationSchema }) body: CreateOrganizationInput,
  ): Promise<Organization> {
    return this.orgs.create(user.userId, body);
  }

  @Get(':orgId')
  @OrgScoped('org:read')
  get(@CurrentOrg() org: OrgContext): Promise<Organization> {
    return this.orgs.get(org.organizationId, org.role);
  }

  @Patch(':orgId')
  @OrgScoped('org:update')
  update(
    @CurrentUser() user: AuthContext,
    @CurrentOrg() org: OrgContext,
    @Body({ schema: updateOrganizationSchema }) body: UpdateOrganizationInput,
  ): Promise<Organization> {
    return this.orgs.update(org.organizationId, user.userId, org.role, body);
  }

  @Get(':orgId/overview')
  @OrgScoped('analytics:read')
  overview(@CurrentOrg() org: OrgContext): Promise<OrganizationOverview> {
    return this.orgs.overview(org.organizationId, org.role);
  }

  @Get(':orgId/audit-logs')
  @OrgScoped('audit:read')
  auditLogs(
    @CurrentOrg() org: OrgContext,
    @Query({ schema: auditQuerySchema }) query: z.infer<typeof auditQuerySchema>,
  ): Promise<Paginated<AuditLogEntry>> {
    return this.audit.list(org.organizationId, query);
  }
}
