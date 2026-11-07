import { z } from 'zod';
import type { UserRef } from './types.js';

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export type TicketSource = 'AI' | 'CUSTOMER' | 'AGENT';
export type TicketEventType = 'CREATED' | 'STATUS_CHANGED' | 'PRIORITY_CHANGED' | 'ASSIGNED' | 'NOTE';

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const TICKET_SOURCE_LABELS: Record<TicketSource, string> = {
  AI: 'Created by the assistant',
  CUSTOMER: 'Customer asked for a person',
  AGENT: 'Created by the team',
};

export interface CustomerRef {
  id: string;
  externalId: string;
  email: string | null;
  name: string | null;
}

export interface TicketSummary {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  source: TicketSource;
  conversationId: string | null;
  assignee: UserRef | null;
  customer: CustomerRef | null;
  /** Contact email from the conversation when the customer isn't verified. */
  contactEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketEventView {
  id: string;
  type: TicketEventType;
  data: Record<string, unknown>;
  createdAt: string;
  actor: UserRef | null;
}

export interface TicketDetail extends TicketSummary {
  description: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  events: TicketEventView[];
}

export const createTicketSchema = z.object({
  subject: z.string().trim().min(3, 'Add a short subject').max(200),
  description: z.string().trim().max(5000).optional(),
  priority: z.enum(TICKET_PRIORITIES).default('NORMAL'),
  conversationId: z.uuid().optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    assigneeId: z.uuid().nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const ticketNoteSchema = z.object({ body: z.string().trim().min(1, 'Write a note').max(5000) });
export type TicketNoteInput = z.infer<typeof ticketNoteSchema>;

export const listTicketsQuerySchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  /** `me`, `unassigned`, or a user id. */
  assignee: z.union([z.literal('me'), z.literal('unassigned'), z.uuid()]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
