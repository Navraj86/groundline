import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  hasPermission,
  type ListTicketsQuery,
  type Paginated,
  type TicketDetail,
  type TicketPriority,
  type TicketSource,
  type TicketSummary,
  type UpdateTicketInput,
} from '@groundline/shared';
import { AuditService } from '../audit/audit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = PrismaService | Prisma.TransactionClient;

const summaryInclude = {
  assignee: { select: { id: true, email: true, fullName: true } },
  customer: { select: { id: true, externalId: true, email: true, name: true } },
  conversation: { select: { visitorEmail: true } },
} satisfies Prisma.TicketInclude;

type TicketRow = Prisma.TicketGetPayload<{ include: typeof summaryInclude }>;

export interface NewTicket {
  subject: string;
  description?: string | null;
  priority?: TicketPriority;
  source: TicketSource;
  conversationId?: string | null;
  customerId?: string | null;
  createdById?: string | null;
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Creates a ticket with the organization's next number. Pass a transaction to join one. */
  async create(organizationId: string, input: NewTicket, db?: Prisma.TransactionClient): Promise<TicketSummary> {
    const run = async (tx: Prisma.TransactionClient) => {
      // Atomic increment: concurrent creations get distinct numbers.
      const { ticketSeq } = await tx.organization.update({
        where: { id: organizationId },
        data: { ticketSeq: { increment: 1 } },
        select: { ticketSeq: true },
      });
      const ticket = await tx.ticket.create({
        data: {
          organizationId,
          number: ticketSeq,
          subject: input.subject.slice(0, 200),
          description: input.description ?? null,
          priority: input.priority ?? 'NORMAL',
          source: input.source,
          conversationId: input.conversationId ?? null,
          customerId: input.customerId ?? null,
          createdById: input.createdById ?? null,
          events: {
            create: {
              organizationId,
              actorUserId: input.createdById ?? null,
              type: 'CREATED',
              data: { source: input.source },
            },
          },
        },
        include: summaryInclude,
      });
      await this.audit.record(
        {
          organizationId,
          actorUserId: input.createdById ?? undefined,
          action: 'ticket.created',
          targetType: 'ticket',
          targetId: ticket.id,
          metadata: { number: ticket.number, subject: ticket.subject, source: ticket.source },
        },
        tx,
      );
      return toSummary(ticket);
    };
    return db ? run(db) : this.prisma.$transaction(run);
  }

  /** The open (not resolved or closed) ticket for a conversation, if any. */
  async openForConversation(organizationId: string, conversationId: string, db: Db = this.prisma) {
    return db.ticket.findFirst({
      where: { organizationId, conversationId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async list(organizationId: string, viewerUserId: string, query: ListTicketsQuery): Promise<Paginated<TicketSummary>> {
    const assigneeFilter =
      query.assignee === 'me'
        ? { assigneeId: viewerUserId }
        : query.assignee === 'unassigned'
          ? { assigneeId: null }
          : query.assignee
            ? { assigneeId: query.assignee }
            : {};
    const rows = await this.prisma.ticket.findMany({
      where: {
        organizationId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.priority ? { priority: query.priority } : {}),
        ...assigneeFilter,
      },
      include: summaryInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, query.limit).map(toSummary);
    return { items, nextCursor: rows.length > query.limit ? items[items.length - 1]!.id : null };
  }

  async get(organizationId: string, number: number): Promise<TicketDetail> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { organizationId_number: { organizationId, number } },
      include: {
        ...summaryInclude,
        events: {
          include: { actor: { select: { id: true, email: true, fullName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) throw new NotFoundException(`Ticket #${number} not found`);
    return {
      ...toSummary(ticket),
      description: ticket.description,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      closedAt: ticket.closedAt?.toISOString() ?? null,
      events: ticket.events.map((e) => ({
        id: e.id,
        type: e.type,
        data: e.data as Record<string, unknown>,
        createdAt: e.createdAt.toISOString(),
        actor: e.actor,
      })),
    };
  }

  async update(organizationId: string, actorUserId: string, number: number, input: UpdateTicketInput): Promise<TicketDetail> {
    await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { organizationId_number: { organizationId, number } } });
      if (!ticket) throw new NotFoundException(`Ticket #${number} not found`);

      const data: Prisma.TicketUncheckedUpdateInput = {};
      const events: Prisma.TicketEventCreateManyInput[] = [];
      const event = (type: Prisma.TicketEventCreateManyInput['type'], payload: Record<string, unknown>) =>
        events.push({ ticketId: ticket.id, organizationId, actorUserId, type, data: payload as Prisma.InputJsonValue });

      if (input.status && input.status !== ticket.status) {
        data.status = input.status;
        if (input.status === 'RESOLVED') data.resolvedAt = new Date();
        if (input.status === 'CLOSED') data.closedAt = new Date();
        if (input.status === 'OPEN' || input.status === 'IN_PROGRESS') {
          data.resolvedAt = null;
          data.closedAt = null;
        }
        event('STATUS_CHANGED', { from: ticket.status, to: input.status });
      }
      if (input.priority && input.priority !== ticket.priority) {
        data.priority = input.priority;
        event('PRIORITY_CHANGED', { from: ticket.priority, to: input.priority });
      }
      if (input.assigneeId !== undefined && input.assigneeId !== ticket.assigneeId) {
        if (input.assigneeId) await this.assertCanBeAssigned(tx, organizationId, input.assigneeId);
        data.assigneeId = input.assigneeId;
        event('ASSIGNED', { from: ticket.assigneeId, to: input.assigneeId });
      }
      if (events.length === 0) return;

      await tx.ticket.update({ where: { id: ticket.id }, data });
      await tx.ticketEvent.createMany({ data: events });
      await this.audit.record(
        {
          organizationId,
          actorUserId,
          action: 'ticket.updated',
          targetType: 'ticket',
          targetId: ticket.id,
          metadata: { number, changes: events.map((e) => e.type) },
        },
        tx,
      );
    });
    return this.get(organizationId, number);
  }

  async addNote(organizationId: string, actorUserId: string, number: number, body: string): Promise<TicketDetail> {
    const ticket = await this.prisma.ticket.findUnique({ where: { organizationId_number: { organizationId, number } } });
    if (!ticket) throw new NotFoundException(`Ticket #${number} not found`);
    await this.prisma.$transaction([
      this.prisma.ticketEvent.create({
        data: { ticketId: ticket.id, organizationId, actorUserId, type: 'NOTE', data: { body } },
      }),
      // Touch the ticket so it rises in "recently updated" lists.
      this.prisma.ticket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } }),
    ]);
    return this.get(organizationId, number);
  }

  private async assertCanBeAssigned(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
    const member = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!member || !hasPermission(member.role, 'tickets:manage')) {
      throw new BadRequestException('Tickets can only be assigned to owners, admins and support agents.');
    }
  }
}

function toSummary(t: TicketRow): TicketSummary {
  return {
    id: t.id,
    number: t.number,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    source: t.source,
    conversationId: t.conversationId,
    assignee: t.assignee,
    customer: t.customer,
    contactEmail: t.customer?.email ?? t.conversation?.visitorEmail ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
