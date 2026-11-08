import { Injectable, Logger } from '@nestjs/common';
import { AGENT_TOOL_NAMES, type AgentToolName, type ToolInfo } from '@groundline/shared';
import { AuditService } from '../audit/audit.service.js';
import { Prisma, type ToolCall } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { ConnectorError, type CustomerIdentity } from './connectors/connector.js';
import { IntegrationsService } from './integrations.service.js';
import { TOOLS, TOOLS_BY_NAME, type ToolContext, type ToolDefinition } from './tools.js';

const APPROVAL_TTL_MS = 72 * 60 * 60 * 1000;
const MAX_OUTPUT_CHARS = 6000;

export interface ToolRequest {
  callId: string;
  name: string;
  /** JSON-encoded arguments, exactly as the model produced them. */
  arguments: string;
}

/** What the model sees as the tool's result. */
export type ToolOutcome = { status: ToolCall['status']; output: Record<string, unknown> };

/** Model-facing tool definition (OpenAI function tool shape). */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * The gate between the model and real actions (BR-008): only registered, enabled tools
 * run, with validated input, for the verified customer only. Sensitive tools become
 * approval requests instead of running (BR-007). Every request is logged (FR-053).
 */
@Injectable()
export class ToolExecutor {
  private readonly logger = new Logger(ToolExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly tickets: TicketsService,
    private readonly audit: AuditService,
  ) {}

  /** Tools and their enabled state for an organization. */
  async toolSettings(organizationId: string): Promise<ToolInfo[]> {
    const enabled = await this.enabledMap(organizationId);
    return TOOLS.map((t) => ({
      name: t.name,
      label: t.label,
      description: t.description,
      sensitive: t.sensitive,
      requiresCustomer: t.requiresCustomer,
      enabled: enabled[t.name],
    }));
  }

  async updateToolSettings(
    organizationId: string,
    actorUserId: string,
    changes: Partial<Record<AgentToolName, boolean>>,
  ): Promise<ToolInfo[]> {
    await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
      const settings = (org.settings ?? {}) as Record<string, unknown>;
      const agent = (settings.agent ?? {}) as { tools?: Record<string, boolean> };
      const tools = { ...agent.tools, ...changes };
      await tx.organization.update({
        where: { id: organizationId },
        data: { settings: { ...settings, agent: { ...agent, tools } } as Prisma.InputJsonValue },
      });
      await this.audit.record(
        { organizationId, actorUserId, action: 'agent.tools_updated', targetType: 'organization', metadata: { changes } },
        tx,
      );
    });
    return this.toolSettings(organizationId);
  }

  /**
   * Tools offered to the model in this conversation: enabled ones, minus account tools
   * when the visitor isn't verified or no account system is connected.
   */
  async availableTools(organizationId: string, conversationId: string): Promise<ToolSpec[]> {
    const [enabled, conversation, connector] = await Promise.all([
      this.enabledMap(organizationId),
      this.prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { customerId: true } }),
      this.integrations.connectorFor(organizationId).catch(() => null),
    ]);
    return TOOLS.filter(
      (t) =>
        enabled[t.name] &&
        (!t.requiresCustomer || conversation.customerId) &&
        (!t.requiresConnector || connector),
    ).map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
  }

  async execute(
    ctx: { organizationId: string; conversationId: string; agentRunId: string | null },
    request: ToolRequest,
  ): Promise<ToolOutcome> {
    const started = Date.now();
    const tool = TOOLS_BY_NAME.get(request.name as AgentToolName);
    let rawInput: unknown = {};
    try {
      rawInput = request.arguments ? JSON.parse(request.arguments) : {};
    } catch {
      rawInput = { _unparsed: request.arguments.slice(0, 500) };
    }

    const block = async (reason: string): Promise<ToolOutcome> => {
      await this.log(ctx, request.name, rawInput, { status: 'BLOCKED', error: reason, sensitive: tool?.sensitive ?? false, started });
      return { status: 'BLOCKED', output: { error: reason } };
    };

    const enabled = await this.enabledMap(ctx.organizationId);
    if (!tool || !enabled[tool.name]) return block(`The tool "${request.name}" isn't available.`);

    const parsed = tool.input.safeParse(rawInput);
    if (!parsed.success) {
      return block(`Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'input'} ${i.message}`).join('; ')}`);
    }

    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: ctx.conversationId },
      include: { customer: true },
    });
    const customer = toIdentity(conversation.customer);
    if (tool.requiresCustomer && !customer) {
      return block(
        "The customer isn't signed in, so their account can't be accessed. Ask them to sign in on the website, or offer to create a ticket.",
      );
    }
    const connector = tool.requiresConnector ? await this.integrations.connectorFor(ctx.organizationId) : null;
    if (tool.requiresConnector && !connector) return block('No account system is connected for this company.');

    if (tool.sensitive) {
      const summary = tool.summarize(parsed.data);
      const ticket = await this.tickets.openForConversation(ctx.organizationId, ctx.conversationId);
      const call = await this.prisma.$transaction(async (tx) => {
        const created = await tx.toolCall.create({
          data: {
            organizationId: ctx.organizationId,
            agentRunId: ctx.agentRunId,
            conversationId: ctx.conversationId,
            tool: tool.name,
            input: parsed.data as Prisma.InputJsonValue,
            status: 'PENDING_APPROVAL',
            sensitive: true,
            durationMs: Date.now() - started,
          },
        });
        await tx.approvalRequest.create({
          data: {
            organizationId: ctx.organizationId,
            toolCallId: created.id,
            conversationId: ctx.conversationId,
            ticketId: ticket?.id ?? null,
            summary,
            expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
          },
        });
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            action: 'approval.requested',
            targetType: 'tool_call',
            targetId: created.id,
            metadata: { tool: tool.name, summary },
          },
          tx,
        );
        return created;
      });
      this.logger.log(`Approval requested for ${tool.name} (${call.id})`);
      return {
        status: 'PENDING_APPROVAL',
        output: {
          status: 'pending_approval',
          summary,
          instruction:
            'This action was sent to the support team for approval and has NOT happened yet. Tell the customer it is pending review and that they will get an update in this chat.',
        },
      };
    }

    return this.run(ctx, tool, parsed.data, rawInput, { customer, connector }, started);
  }

  /** Runs a previously approved sensitive tool call and records the result on it. */
  async runApproved(toolCall: ToolCall): Promise<ToolOutcome> {
    const started = Date.now();
    const tool = TOOLS_BY_NAME.get(toolCall.tool as AgentToolName);
    const conversation = toolCall.conversationId
      ? await this.prisma.conversation.findUnique({ where: { id: toolCall.conversationId }, include: { customer: true } })
      : null;
    const customer = toIdentity(conversation?.customer ?? null);
    const fail = async (error: string): Promise<ToolOutcome> => {
      await this.prisma.toolCall.update({
        where: { id: toolCall.id },
        data: { status: 'FAILED', error, completedAt: new Date(), durationMs: Date.now() - started },
      });
      return { status: 'FAILED', output: { error } };
    };
    if (!tool || !conversation || !customer) return fail('The customer or conversation no longer exists.');
    const connector = await this.integrations.connectorFor(toolCall.organizationId).catch(() => null);
    if (!connector) return fail('No account system is connected anymore.');

    try {
      const output = await tool.run(this.context(toolCall.organizationId, conversation.id, customer, connector), toolCall.input);
      await this.prisma.toolCall.update({
        where: { id: toolCall.id },
        data: {
          status: 'SUCCEEDED',
          output: limit(output) as Prisma.InputJsonValue,
          completedAt: new Date(),
          durationMs: Date.now() - started,
        },
      });
      return { status: 'SUCCEEDED', output: { result: limit(output) } };
    } catch (err) {
      return fail(err instanceof ConnectorError ? err.message : `The action failed: ${(err as Error).message}`);
    }
  }

  private async run<I>(
    ctx: { organizationId: string; conversationId: string; agentRunId: string | null },
    tool: ToolDefinition<I>,
    input: I,
    rawInput: unknown,
    deps: { customer: CustomerIdentity | null; connector: ToolContext['connector'] },
    started: number,
  ): Promise<ToolOutcome> {
    try {
      const output = limit(await tool.run(this.context(ctx.organizationId, ctx.conversationId, deps.customer, deps.connector), input));
      await this.log(ctx, tool.name, rawInput, { status: 'SUCCEEDED', output, sensitive: false, started });
      return { status: 'SUCCEEDED', output: { result: output } };
    } catch (err) {
      const message = err instanceof ConnectorError ? err.message : `The tool failed: ${(err as Error).message}`;
      if (!(err instanceof ConnectorError)) this.logger.error(`${tool.name} failed: ${(err as Error).message}`);
      await this.log(ctx, tool.name, rawInput, { status: 'FAILED', error: message, sensitive: false, started });
      return { status: 'FAILED', output: { error: message } };
    }
  }

  private context(
    organizationId: string,
    conversationId: string,
    customer: CustomerIdentity | null,
    connector: ToolContext['connector'],
  ): ToolContext {
    return {
      organizationId,
      conversationId,
      customer,
      connector,
      createTicket: async (input) => {
        return this.prisma.$transaction(async (tx) => {
          const existing = await this.tickets.openForConversation(organizationId, conversationId, tx);
          if (existing) return { ticketNumber: existing.number, existing: true };
          const ticket = await this.tickets.create(
            organizationId,
            {
              subject: input.subject,
              description: input.summary,
              priority: input.priority,
              source: 'AI',
              conversationId,
              customerId: customer?.customerId ?? null,
            },
            tx,
          );
          // A human owns the conversation from here on.
          await tx.conversation.update({
            where: { id: conversationId },
            data: { status: 'ESCALATED', escalatedAt: new Date() },
          });
          return { ticketNumber: ticket.number, existing: false };
        });
      },
    };
  }

  private async log(
    ctx: { organizationId: string; conversationId: string; agentRunId: string | null },
    tool: string,
    input: unknown,
    result: { status: ToolCall['status']; output?: unknown; error?: string; sensitive: boolean; started: number },
  ): Promise<void> {
    await this.prisma.toolCall.create({
      data: {
        organizationId: ctx.organizationId,
        agentRunId: ctx.agentRunId,
        conversationId: ctx.conversationId,
        tool: tool.slice(0, 100),
        input: (input ?? {}) as Prisma.InputJsonValue,
        output: result.output === undefined ? Prisma.DbNull : (result.output as Prisma.InputJsonValue),
        status: result.status,
        sensitive: result.sensitive,
        error: result.error ?? null,
        durationMs: Date.now() - result.started,
        completedAt: new Date(),
      },
    });
  }

  private async enabledMap(organizationId: string): Promise<Record<AgentToolName, boolean>> {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } });
    const configured = (((org.settings ?? {}) as Record<string, unknown>).agent as { tools?: Record<string, boolean> } | undefined)
      ?.tools;
    // Tools are on by default; account tools still need a connector and a verified customer.
    return Object.fromEntries(AGENT_TOOL_NAMES.map((n) => [n, configured?.[n] ?? true])) as Record<AgentToolName, boolean>;
  }
}

function toIdentity(c: { id: string; externalId: string; email: string | null; name: string | null } | null): CustomerIdentity | null {
  return c ? { customerId: c.id, externalId: c.externalId, email: c.email, name: c.name } : null;
}

/** Keeps tool output small enough for the model and the database. */
function limit(output: unknown): unknown {
  const json = JSON.stringify(output ?? null);
  return json.length <= MAX_OUTPUT_CHARS ? (output ?? null) : { truncated: true, preview: json.slice(0, MAX_OUTPUT_CHARS) };
}
