import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  escalateSchema,
  sendMessageSchema,
  startConversationSchema,
  type ConversationDetail,
  type EscalateInput,
  type SendMessageInput,
  type SendMessageResult,
  type StartConversationInput,
  type WidgetConfig,
  type WidgetSession,
} from '@groundline/shared';
import { z } from 'zod';
import { Public } from '../auth/decorators.js';
import { AssistantService } from './assistant.service.js';
import { ChatService } from './chat.service.js';
import { WidgetTokenService } from './widget-token.service.js';

const widgetKey = { schema: z.string().regex(/^wk_[A-Za-z0-9_-]{10,64}$/) };
const conversationId = { schema: z.uuid() };

/**
 * Public endpoints for the embeddable chat widget. The widget key identifies the
 * organization; a per-conversation visitor token authorizes reading and posting.
 */
@Public()
@Controller('widget')
export class WidgetController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly chat: ChatService,
    private readonly tokens: WidgetTokenService,
  ) {}

  @Get(':widgetKey')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  config(@Param('widgetKey', widgetKey) key: string): Promise<WidgetConfig> {
    return this.assistant.widgetConfig(key);
  }

  @Post(':widgetKey/conversations')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async start(
    @Param('widgetKey', widgetKey) key: string,
    @Body({ schema: startConversationSchema }) body: StartConversationInput,
  ): Promise<WidgetSession> {
    const { organizationId } = await this.assistant.resolveWidget(key);
    const conversation = await this.chat.start(organizationId, body);
    const visitorToken = await this.tokens.issue({ conversationId: conversation.id, organizationId });
    return { conversation, visitorToken };
  }

  @Get('conversations/:conversationId')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async get(
    @Param('conversationId', conversationId) id: string,
    @Headers('authorization') auth: string | undefined,
  ): Promise<ConversationDetail> {
    const visitor = await this.tokens.verify(auth, id);
    return this.chat.getForVisitor(visitor.organizationId, id);
  }

  @Post('conversations/:conversationId/messages')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async send(
    @Param('conversationId', conversationId) id: string,
    @Headers('authorization') auth: string | undefined,
    @Body({ schema: sendMessageSchema }) body: SendMessageInput,
  ): Promise<SendMessageResult> {
    const visitor = await this.tokens.verify(auth, id);
    return this.chat.sendCustomerMessage(visitor.organizationId, id, body.content);
  }

  @Post('conversations/:conversationId/escalate')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async escalate(
    @Param('conversationId', conversationId) id: string,
    @Headers('authorization') auth: string | undefined,
    @Body({ schema: escalateSchema }) body: EscalateInput,
  ): Promise<ConversationDetail> {
    const visitor = await this.tokens.verify(auth, id);
    return this.chat.escalate(visitor.organizationId, id, body);
  }
}
