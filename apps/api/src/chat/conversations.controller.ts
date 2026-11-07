import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  assistantSettingsSchema,
  CONVERSATION_STATUSES,
  sendMessageSchema,
  updateConversationSchema,
  type AssistantConfig,
  type AssistantSettingsInput,
  type ChatMessage,
  type ConversationDetail,
  type ConversationSummary,
  type Paginated,
  type SendMessageInput,
  type UpdateConversationInput,
} from '@groundline/shared';
import { z } from 'zod';
import type { AuthContext, OrgContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { CurrentOrg, OrgScoped } from '../organizations/org-access.js';
import { AssistantService } from './assistant.service.js';
import { ChatService } from './chat.service.js';

const listQuery = z.object({
  status: z.enum(CONVERSATION_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});
const conversationId = { schema: z.uuid() };

@Controller('orgs/:orgId/conversations')
export class ConversationsController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @OrgScoped('conversations:read')
  list(
    @CurrentOrg() org: OrgContext,
    @Query({ schema: listQuery }) query: z.infer<typeof listQuery>,
  ): Promise<Paginated<ConversationSummary>> {
    return this.chat.list(org.organizationId, query);
  }

  @Get(':conversationId')
  @OrgScoped('conversations:read')
  get(@CurrentOrg() org: OrgContext, @Param('conversationId', conversationId) id: string): Promise<ConversationDetail> {
    return this.chat.getForTeam(org.organizationId, id);
  }

  @Post(':conversationId/messages')
  @OrgScoped('conversations:reply')
  reply(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Param('conversationId', conversationId) id: string,
    @Body({ schema: sendMessageSchema }) body: SendMessageInput,
  ): Promise<ChatMessage> {
    return this.chat.agentReply(org.organizationId, id, user.userId, body.content);
  }

  @Patch(':conversationId')
  @OrgScoped('conversations:reply')
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Param('conversationId', conversationId) id: string,
    @Body({ schema: updateConversationSchema }) body: UpdateConversationInput,
  ): Promise<ConversationDetail> {
    return this.chat.setStatus(org.organizationId, id, user.userId, body.status);
  }
}

@Controller('orgs/:orgId/assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get()
  @OrgScoped('knowledge:read')
  get(@CurrentOrg() org: OrgContext): Promise<AssistantConfig> {
    return this.assistant.get(org.organizationId);
  }

  @Patch()
  @OrgScoped('assistant:manage')
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Body({ schema: assistantSettingsSchema }) body: AssistantSettingsInput,
  ): Promise<AssistantConfig> {
    return this.assistant.update(org.organizationId, user.userId, body);
  }

  @Post('rotate-key')
  @OrgScoped('assistant:manage')
  rotate(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthContext): Promise<AssistantConfig> {
    return this.assistant.rotateKey(org.organizationId, user.userId);
  }
}
