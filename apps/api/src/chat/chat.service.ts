import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AnswerSource,
  ChatMessage,
  ConversationDetail,
  ConversationStatus,
  ConversationSummary,
  EscalateInput,
  Paginated,
  SendMessageResult,
  StartConversationInput,
  ToolCallView,
} from '@groundline/shared';
import { toToolCallView } from '../agent/agent.controller.js';
import { ToolExecutor } from '../agent/tool-executor.service.js';
import { AuditService } from '../audit/audit.service.js';
import { EntitlementsService, PlanLimitException } from '../billing/entitlements.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { AiClient, type AgentStepRequest, type AgentStepResult } from './ai-client.service.js';
import { readAssistantSettings } from './assistant.service.js';

const HISTORY_LIMIT = 12;
// Model turns per reply (each may request tools) and tool calls honored per turn.
const MAX_AGENT_STEPS = 4;
const MAX_TOOL_CALLS_PER_STEP = 3;
const STEP_LIMIT_REPLY =
  "Sorry, I couldn't finish that request. You can ask to talk to a person and the team will follow up.";
const ESCALATED_NOTICE = "Thanks, you're now in the queue for our team. Someone will reply right here.";
const LIMIT_REACHED_REPLY =
  "Our assistant can't take new conversations right now. Leave your email and someone from the team will get back to you.";

type MessageRow = Prisma.MessageGetPayload<object>;
type ConversationRow = Prisma.ConversationGetPayload<object>;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClient,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
    private readonly tickets: TicketsService,
    private readonly toolExecutor: ToolExecutor,
  ) {}

  // ---- Widget (customer-facing) ----------------------------------------------------

  async start(
    organizationId: string,
    input: StartConversationInput,
    verified?: { customerId: string; email: string | null; name: string | null },
  ): Promise<ConversationDetail> {
    const conversation = await this.prisma.conversation.create({
      data: {
        organizationId,
        channel: input.channel,
        visitorId: input.visitorId ?? randomUUID(),
        // A verified identity wins over anything the visitor typed.
        visitorName: verified?.name ?? input.name ?? null,
        visitorEmail: verified?.email ?? input.email ?? null,
        customerId: verified?.customerId ?? null,
      },
    });
    return toDetail(conversation, [], { includeMeta: false, pendingApprovals: 0 });
  }

  async getForVisitor(organizationId: string, conversationId: string): Promise<ConversationDetail> {
    return this.detail(organizationId, conversationId, { includeMeta: false });
  }

  /** Stores the customer's message and, unless a human has taken over, the AI's reply. */
  async sendCustomerMessage(organizationId: string, conversationId: string, content: string): Promise<SendMessageResult> {
    const conversation = await this.findConversation(organizationId, conversationId);
    const customerMessage = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: { conversationId, organizationId, role: 'CUSTOMER', content },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: message.createdAt,
          // A new question reopens a resolved conversation.
          ...(conversation.status === 'RESOLVED' ? { status: 'OPEN', resolvedAt: null } : {}),
          ...(conversation.title ? {} : { title: content.slice(0, 120) }),
        },
      });
      return message;
    });

    if (conversation.status === 'ESCALATED') {
      // A human owns this conversation now; the AI stays quiet.
      return {
        message: toMessage(customerMessage, false),
        reply: null,
        status: 'ESCALATED',
        pendingApprovals: await this.prisma.approvalRequest.count({ where: { conversationId, status: 'PENDING' } }),
      };
    }

    const reply = await this.generateReply(conversation, content);
    // Tools can change the conversation (create_ticket hands it to the team), so re-read it.
    const { status } = await this.prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { status: true } });
    const pendingApprovals = await this.prisma.approvalRequest.count({ where: { conversationId, status: 'PENDING' } });
    return { message: toMessage(customerMessage, false), reply: toMessage(reply, false), status, pendingApprovals };
  }

  /** Hands the conversation to the team (FR-038). Tickets attach to this in a later phase. */
  async escalate(organizationId: string, conversationId: string, input: EscalateInput): Promise<ConversationDetail> {
    const conversation = await this.findConversation(organizationId, conversationId);
    if (conversation.status !== 'ESCALATED') {
      await this.prisma.$transaction(async (tx) => {
        const notice = await tx.message.create({
          data: { conversationId, organizationId, role: 'ASSISTANT', content: ESCALATED_NOTICE, answerStatus: 'ANSWERED' },
        });
        await tx.conversation.update({
          where: { id: conversationId },
          data: {
            status: 'ESCALATED',
            escalatedAt: new Date(),
            lastMessageAt: notice.createdAt,
            ...(input.email ? { visitorEmail: input.email } : {}),
          },
        });
        if (input.note) {
          await tx.message.create({ data: { conversationId, organizationId, role: 'CUSTOMER', content: input.note } });
        }
        // Workflow 7.6: the handoff becomes a ticket with the conversation attached.
        if (!(await this.tickets.openForConversation(organizationId, conversationId, tx))) {
          await this.tickets.create(
            organizationId,
            {
              subject: conversation.title ?? 'Customer asked to talk to a person',
              description: input.note ?? null,
              source: 'CUSTOMER',
              conversationId,
              customerId: conversation.customerId,
            },
            tx,
          );
        }
        await this.audit.record(
          {
            organizationId,
            action: 'conversation.escalated',
            targetType: 'conversation',
            targetId: conversationId,
            metadata: { email: input.email ?? conversation.visitorEmail ?? null },
          },
          tx,
        );
      });
    }
    return this.detail(organizationId, conversationId, { includeMeta: false });
  }

  // ---- Dashboard (team-facing) -------------------------------------------------------

  async list(
    organizationId: string,
    opts: { status?: ConversationStatus; limit: number; cursor?: string },
  ): Promise<Paginated<ConversationSummary>> {
    const rows = await this.prisma.conversation.findMany({
      where: { organizationId, ...(opts.status ? { status: opts.status } : {}) },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: true } },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, opts.limit).map((row) => ({
      ...toSummary(row, row._count.messages),
      lastMessage: row.messages[0] ? { role: row.messages[0].role, content: row.messages[0].content } : null,
    }));
    return { items, nextCursor: rows.length > opts.limit ? items[items.length - 1]!.id : null };
  }

  getForTeam(organizationId: string, conversationId: string): Promise<ConversationDetail> {
    return this.detail(organizationId, conversationId, { includeMeta: true });
  }

  async agentReply(
    organizationId: string,
    conversationId: string,
    actorUserId: string,
    content: string,
  ): Promise<ChatMessage> {
    const conversation = await this.findConversation(organizationId, conversationId);
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({ data: { conversationId, organizationId, role: 'AGENT', content } });
      // A team reply means a human owns the conversation from here on.
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: created.createdAt,
          status: 'ESCALATED',
          escalatedAt: conversation.escalatedAt ?? new Date(),
        },
      });
      await this.audit.record(
        {
          organizationId,
          actorUserId,
          action: 'conversation.replied',
          targetType: 'conversation',
          targetId: conversationId,
        },
        tx,
      );
      return created;
    });
    return toMessage(message, true);
  }

  async setStatus(
    organizationId: string,
    conversationId: string,
    actorUserId: string,
    status: 'OPEN' | 'RESOLVED',
  ): Promise<ConversationDetail> {
    await this.findConversation(organizationId, conversationId);
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: status === 'RESOLVED' ? { status, resolvedAt: new Date() } : { status, resolvedAt: null, escalatedAt: null },
    });
    await this.audit.record({
      organizationId,
      actorUserId,
      action: status === 'RESOLVED' ? 'conversation.resolved' : 'conversation.reopened',
      targetType: 'conversation',
      targetId: conversationId,
    });
    return this.detail(organizationId, conversationId, { includeMeta: true });
  }

  // ---- Internals ---------------------------------------------------------------------

  private async generateReply(conversation: ConversationRow, question: string): Promise<MessageRow> {
    const { organizationId, id: conversationId } = conversation;

    // Each conversation counts once against the monthly limit, when the AI first engages.
    if (!conversation.aiEngagedAt) {
      try {
        await this.entitlements.consume(organizationId, 'monthlyMessages');
      } catch (err) {
        if (!(err instanceof PlanLimitException)) throw err;
        this.logger.warn(`Organization ${organizationId} reached its monthly conversation limit`);
        return this.saveReply(conversation, { content: LIMIT_REACHED_REPLY, answerStatus: 'ERROR', sources: [] });
      }
    }

    const [org, history] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
      this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_LIMIT + 1,
      }),
    ]);
    const settings = readAssistantSettings(org.settings);
    // The newest message is the question itself; send the turns before it as history.
    const previous = history.slice(1).reverse();

    const started = Date.now();
    const tools = await this.toolExecutor.availableTools(organizationId, conversationId);
    // Created up front so the tool calls of this reply can reference it.
    const run = await this.prisma.agentRun.create({
      data: { organizationId, conversationId, status: 'FAILED', steps: 0, latencyMs: 0 },
    });
    const steps: AgentStepRequest['steps'] = [];
    const usage = { input: 0, output: 0 };
    let result: AgentStepResult | null = null;

    for (let step = 1; step <= MAX_AGENT_STEPS; step++) {
      const response = await this.ai.respond({
        organizationId,
        question,
        history: previous.map((m) => ({ role: m.role, content: m.content })),
        assistant: { name: settings.name, companyName: org.name, instructions: settings.instructions },
        tools,
        steps,
        customerSignedIn: conversation.customerId !== null,
      });
      usage.input += response.input_tokens ?? 0;
      usage.output += response.output_tokens ?? 0;
      if (response.status !== 'TOOL_CALLS') {
        result = response;
        break;
      }
      // The model only proposes; the executor decides what actually runs (BR-008).
      for (const call of response.tool_calls.slice(0, MAX_TOOL_CALLS_PER_STEP)) {
        const outcome = await this.toolExecutor.execute(
          { organizationId, conversationId, agentRunId: run.id },
          { callId: call.call_id, name: call.name, arguments: call.arguments },
        );
        steps.push({ ...call, output: JSON.stringify(outcome.output) });
      }
      result = response;
    }
    if (!result || result.status === 'TOOL_CALLS') {
      result = {
        ...(result ?? { provider: null, model: null, sources: [] }),
        status: 'ERROR',
        answer: STEP_LIMIT_REPLY,
        tool_calls: [],
        sources: [],
        input_tokens: null,
        output_tokens: null,
        latency_ms: Date.now() - started,
      } as AgentStepResult;
    }

    const sources: AnswerSource[] = result.sources.map((s) => ({
      index: s.index,
      sourceId: s.source_id,
      title: s.title,
      url: s.url,
      pages: s.pages,
      snippet: s.snippet,
    }));
    const latencyMs = Date.now() - started;
    const message = await this.saveReply(conversation, {
      content: result.answer,
      answerStatus: result.status as 'ANSWERED' | 'INSUFFICIENT_CONTEXT' | 'ERROR',
      sources,
      provider: result.provider,
      model: result.model,
      inputTokens: usage.input || null,
      outputTokens: usage.output || null,
      latencyMs,
      // The conversation has been counted against the monthly limit; don't count it again.
      engaged: true,
    });
    await this.prisma.agentRun.update({
      where: { id: run.id },
      data: {
        messageId: message.id,
        status: result.status === 'ERROR' ? 'FAILED' : 'COMPLETED',
        steps: steps.length,
        provider: result.provider,
        model: result.model,
        inputTokens: usage.input,
        outputTokens: usage.output,
        latencyMs,
      },
    });
    return message;
  }

  private async saveReply(
    conversation: ConversationRow,
    reply: {
      content: string;
      answerStatus: 'ANSWERED' | 'INSUFFICIENT_CONTEXT' | 'ERROR';
      sources: AnswerSource[];
      provider?: string | null;
      model?: string | null;
      inputTokens?: number | null;
      outputTokens?: number | null;
      latencyMs?: number | null;
      engaged?: boolean;
    },
  ): Promise<MessageRow> {
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId: conversation.id,
          organizationId: conversation.organizationId,
          role: 'ASSISTANT',
          content: reply.content,
          answerStatus: reply.answerStatus,
          sources: reply.sources as unknown as Prisma.InputJsonValue,
          provider: reply.provider ?? null,
          model: reply.model ?? null,
          inputTokens: reply.inputTokens ?? null,
          outputTokens: reply.outputTokens ?? null,
          latencyMs: reply.latencyMs ?? null,
        },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: message.createdAt,
          ...(reply.engaged && !conversation.aiEngagedAt ? { aiEngagedAt: new Date() } : {}),
        },
      });
      return message;
    });
  }

  private async findConversation(organizationId: string, conversationId: string): Promise<ConversationRow> {
    const conversation = await this.prisma.conversation.findFirst({ where: { id: conversationId, organizationId } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  private async detail(
    organizationId: string,
    conversationId: string,
    opts: { includeMeta: boolean },
  ): Promise<ConversationDetail> {
    const conversation = await this.findConversation(organizationId, conversationId);
    const [messages, pendingApprovals, toolCalls] = await Promise.all([
      this.prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' }, take: 500 }),
      this.prisma.approvalRequest.count({ where: { conversationId, status: 'PENDING' } }),
      opts.includeMeta
        ? this.prisma.toolCall.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' }, take: 200 })
        : Promise.resolve([]),
    ]);
    return toDetail(conversation, messages, {
      ...opts,
      pendingApprovals,
      toolCalls: opts.includeMeta ? toolCalls.map(toToolCallView) : undefined,
    });
  }
}

function toMessage(row: MessageRow, includeMeta: boolean): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    answerStatus: row.answerStatus,
    sources: (row.sources as unknown as AnswerSource[]) ?? [],
    createdAt: row.createdAt.toISOString(),
    ...(includeMeta
      ? {
          meta: {
            provider: row.provider,
            model: row.model,
            inputTokens: row.inputTokens,
            outputTokens: row.outputTokens,
            latencyMs: row.latencyMs,
          },
        }
      : {}),
  };
}

function toSummary(row: ConversationRow, messageCount: number): Omit<ConversationSummary, 'lastMessage'> {
  return {
    id: row.id,
    channel: row.channel,
    status: row.status,
    title: row.title,
    visitorName: row.visitorName,
    visitorEmail: row.visitorEmail,
    messageCount,
    lastMessageAt: row.lastMessageAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toDetail(
  row: ConversationRow,
  messages: MessageRow[],
  opts: { includeMeta: boolean; pendingApprovals: number; toolCalls?: ToolCallView[] },
): ConversationDetail {
  const last = messages[messages.length - 1];
  return {
    ...toSummary(row, messages.length),
    lastMessage: last ? { role: last.role, content: last.content } : null,
    verified: row.customerId !== null,
    pendingApprovals: opts.pendingApprovals,
    ...(opts.toolCalls ? { toolCalls: opts.toolCalls } : {}),
    escalatedAt: row.escalatedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    messages: messages.map((m) => toMessage(m, opts.includeMeta)),
  };
}
