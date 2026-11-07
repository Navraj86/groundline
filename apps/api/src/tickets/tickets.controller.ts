import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createTicketSchema,
  listTicketsQuerySchema,
  ticketNoteSchema,
  updateTicketSchema,
  type CreateTicketInput,
  type ListTicketsQuery,
  type Paginated,
  type TicketDetail,
  type TicketNoteInput,
  type TicketSummary,
  type UpdateTicketInput,
} from '@groundline/shared';
import { z } from 'zod';
import type { AuthContext, OrgContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { CurrentOrg, OrgScoped } from '../organizations/org-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketsService } from './tickets.service.js';

const ticketNumber = { schema: z.coerce.number().int().positive() };

@Controller('orgs/:orgId/tickets')
export class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @OrgScoped('tickets:manage')
  list(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Query({ schema: listTicketsQuerySchema }) query: ListTicketsQuery,
  ): Promise<Paginated<TicketSummary>> {
    return this.tickets.list(org.organizationId, user.userId, query);
  }

  @Post()
  @OrgScoped('tickets:manage')
  async create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Body({ schema: createTicketSchema }) body: CreateTicketInput,
  ): Promise<TicketSummary> {
    let customerId: string | null = null;
    if (body.conversationId) {
      const conversation = await this.prisma.conversation.findFirst({
        where: { id: body.conversationId, organizationId: org.organizationId },
        select: { customerId: true },
      });
      if (!conversation) throw new NotFoundException('Conversation not found');
      customerId = conversation.customerId;
    }
    return this.tickets.create(org.organizationId, {
      subject: body.subject,
      description: body.description,
      priority: body.priority,
      source: 'AGENT',
      conversationId: body.conversationId,
      customerId,
      createdById: user.userId,
    });
  }

  @Get(':number')
  @OrgScoped('tickets:manage')
  get(@CurrentOrg() org: OrgContext, @Param('number', ticketNumber) number: number): Promise<TicketDetail> {
    return this.tickets.get(org.organizationId, number);
  }

  @Patch(':number')
  @OrgScoped('tickets:manage')
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Param('number', ticketNumber) number: number,
    @Body({ schema: updateTicketSchema }) body: UpdateTicketInput,
  ): Promise<TicketDetail> {
    return this.tickets.update(org.organizationId, user.userId, number, body);
  }

  @Post(':number/notes')
  @OrgScoped('tickets:manage')
  addNote(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Param('number', ticketNumber) number: number,
    @Body({ schema: ticketNoteSchema }) body: TicketNoteInput,
  ): Promise<TicketDetail> {
    return this.tickets.addNote(org.organizationId, user.userId, number, body.body);
  }
}
