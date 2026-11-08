import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { AiClient } from './ai-client.service.js';
import { AnswerReviewService } from './answer-review.service.js';
import { AssistantService } from './assistant.service.js';
import { ChatService } from './chat.service.js';
import { AssistantController, ConversationsController } from './conversations.controller.js';
import { WidgetTokenService } from './widget-token.service.js';
import { WidgetController } from './widget.controller.js';

@Module({
  imports: [OrganizationsModule, TicketsModule, AgentModule],
  controllers: [WidgetController, ConversationsController, AssistantController],
  providers: [AiClient, AnswerReviewService, AssistantService, ChatService, WidgetTokenService],
  exports: [AiClient],
})
export class ChatModule {}
