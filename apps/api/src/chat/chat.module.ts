import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { AiClient } from './ai-client.service.js';
import { AssistantService } from './assistant.service.js';
import { ChatService } from './chat.service.js';
import { AssistantController, ConversationsController } from './conversations.controller.js';
import { WidgetTokenService } from './widget-token.service.js';
import { WidgetController } from './widget.controller.js';

@Module({
  imports: [OrganizationsModule],
  controllers: [WidgetController, ConversationsController, AssistantController],
  providers: [AiClient, AssistantService, ChatService, WidgetTokenService],
})
export class ChatModule {}
