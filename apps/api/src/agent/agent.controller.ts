import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  actionsApiIntegrationSchema,
  decideApprovalSchema,
  sandboxIntegrationSchema,
  updateToolsSchema,
  type ActionsApiIntegrationInput,
  type AgentToolName,
  type ApprovalView,
  type DecideApprovalInput,
  type IdentitySettings,
  type IntegrationView,
  type Paginated,
  type SandboxIntegrationInput,
  type ToolCallView,
  type ToolInfo,
  type UpdateToolsInput,
} from '@groundline/shared';
import { z } from 'zod';
import type { AuthContext, OrgContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { CurrentOrg, OrgScoped } from '../organizations/org-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApprovalsService } from './approvals.service.js';
import { IntegrationsService } from './integrations.service.js';
import { ToolExecutor } from './tool-executor.service.js';
import { TOOLS_BY_NAME } from './tools.js';

const page = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});
const approvalQuery = page.extend({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']).optional() });

@Controller('orgs/:orgId')
export class AgentController {
  constructor(
    private readonly executor: ToolExecutor,
    private readonly approvals: ApprovalsService,
    private readonly integrations: IntegrationsService,
    private readonly prisma: PrismaService,
  ) {}

  // ---- Tools ------------------------------------------------------------------------------

  @Get('agent/tools')
  @OrgScoped('agent:read')
  tools(@CurrentOrg() org: OrgContext): Promise<ToolInfo[]> {
    return this.executor.toolSettings(org.organizationId);
  }

  @Patch('agent/tools')
  @OrgScoped('assistant:manage')
  updateTools(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Body({ schema: updateToolsSchema }) body: UpdateToolsInput,
  ): Promise<ToolInfo[]> {
    return this.executor.updateToolSettings(org.organizationId, user.userId, body.tools);
  }

  @Get('agent/tool-calls')
  @OrgScoped('agent:read')
  async toolCalls(
    @CurrentOrg() org: OrgContext,
    @Query({ schema: page }) query: z.infer<typeof page>,
  ): Promise<Paginated<ToolCallView>> {
    const rows = await this.prisma.toolCall.findMany({
      where: { organizationId: org.organizationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, query.limit).map(toToolCallView);
    return { items, nextCursor: rows.length > query.limit ? items[items.length - 1]!.id : null };
  }

  // ---- Approvals ----------------------------------------------------------------------------

  @Get('approvals')
  @OrgScoped('approvals:read')
  listApprovals(
    @CurrentOrg() org: OrgContext,
    @Query({ schema: approvalQuery }) query: z.infer<typeof approvalQuery>,
  ): Promise<Paginated<ApprovalView>> {
    return this.approvals.list(org.organizationId, query);
  }

  @Post('approvals/:approvalId/decision')
  @OrgScoped('approvals:decide')
  @HttpCode(HttpStatus.OK)
  decide(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Param('approvalId', { schema: z.uuid() }) approvalId: string,
    @Body({ schema: decideApprovalSchema }) body: DecideApprovalInput,
  ): Promise<ApprovalView> {
    return this.approvals.decide(org.organizationId, user.userId, approvalId, body);
  }

  // ---- Integrations and identity --------------------------------------------------------------

  @Get('integrations')
  @OrgScoped('integrations:manage')
  listIntegrations(@CurrentOrg() org: OrgContext): Promise<IntegrationView[]> {
    return this.integrations.list(org.organizationId);
  }

  @Put('integrations/sandbox')
  @OrgScoped('integrations:manage')
  setSandbox(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Body({ schema: sandboxIntegrationSchema }) body: SandboxIntegrationInput,
  ): Promise<IntegrationView[]> {
    return this.integrations.setSandbox(org.organizationId, user.userId, body);
  }

  @Put('integrations/actions-api')
  @OrgScoped('integrations:manage')
  setActionsApi(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Body({ schema: actionsApiIntegrationSchema }) body: ActionsApiIntegrationInput,
  ): Promise<IntegrationView[]> {
    return this.integrations.setActionsApi(org.organizationId, user.userId, body);
  }

  @Post('integrations/actions-api/rotate-secret')
  @OrgScoped('integrations:manage')
  rotateActionsSecret(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthContext): Promise<IntegrationView[]> {
    return this.integrations.rotateActionsApiSecret(org.organizationId, user.userId);
  }

  @Get('identity')
  @OrgScoped('integrations:manage')
  identity(@CurrentOrg() org: OrgContext): Promise<IdentitySettings> {
    return this.integrations.identity(org.organizationId);
  }

  @Post('identity/rotate')
  @OrgScoped('integrations:manage')
  rotateIdentity(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthContext): Promise<IdentitySettings> {
    return this.integrations.rotateIdentitySecret(org.organizationId, user.userId);
  }

  @Delete('identity')
  @OrgScoped('integrations:manage')
  disableIdentity(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthContext): Promise<IdentitySettings> {
    return this.integrations.disableIdentity(org.organizationId, user.userId);
  }
}

export function toToolCallView(row: {
  id: string;
  tool: string;
  input: unknown;
  output: unknown;
  status: ToolCallView['status'];
  sensitive: boolean;
  error: string | null;
  durationMs: number | null;
  conversationId: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): ToolCallView {
  return {
    id: row.id,
    tool: row.tool,
    label: TOOLS_BY_NAME.get(row.tool as AgentToolName)?.label ?? row.tool,
    input: (row.input ?? {}) as Record<string, unknown>,
    output: row.output ?? null,
    status: row.status,
    sensitive: row.sensitive,
    error: row.error,
    durationMs: row.durationMs,
    conversationId: row.conversationId,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}
