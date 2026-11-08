import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { AgentController } from './agent.controller.js';
import { ApprovalsService } from './approvals.service.js';
import { IdentityService } from './identity.service.js';
import { IntegrationsService } from './integrations.service.js';
import { ToolExecutor } from './tool-executor.service.js';

@Module({
  imports: [OrganizationsModule, TicketsModule],
  controllers: [AgentController],
  providers: [IntegrationsService, ToolExecutor, ApprovalsService, IdentityService],
  exports: [ToolExecutor, ApprovalsService, IdentityService],
})
export class AgentModule {}
