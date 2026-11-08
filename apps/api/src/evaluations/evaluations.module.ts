import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { EvalRunner } from './eval-runner.service.js';
import { EvaluationsController } from './evaluations.controller.js';
import { EvaluationsService } from './evaluations.service.js';

@Module({
  imports: [OrganizationsModule, ChatModule],
  controllers: [EvaluationsController],
  providers: [EvaluationsService, EvalRunner],
})
export class EvaluationsModule {}
