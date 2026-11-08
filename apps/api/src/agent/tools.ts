import type { AgentToolName } from '@groundline/shared';
import { z } from 'zod';
import type { CommerceConnector, CustomerIdentity } from './connectors/connector.js';

export interface ToolContext {
  organizationId: string;
  conversationId: string;
  /** The verified customer, or null for anonymous visitors. */
  customer: CustomerIdentity | null;
  connector: CommerceConnector | null;
  createTicket(input: { subject: string; summary: string; priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' }): Promise<{
    ticketNumber: number;
    existing: boolean;
  }>;
}

export interface ToolDefinition<I = unknown> {
  name: AgentToolName;
  label: string;
  /** Shown to the model and in the dashboard. */
  description: string;
  sensitive: boolean;
  requiresCustomer: boolean;
  requiresConnector: boolean;
  /** JSON Schema for the model (strict: every property required, no extras). */
  parameters: Record<string, unknown>;
  /** The same contract, enforced on our side before anything runs. */
  input: z.ZodType<I>;
  /** Plain-language description of the action, used for approval requests. */
  summarize(input: I): string;
  run(ctx: ToolContext, input: I): Promise<unknown>;
}

const noParameters = { type: 'object', properties: {}, required: [], additionalProperties: false };

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function connector(ctx: ToolContext): CommerceConnector {
  if (!ctx.connector) throw new Error('No account system is connected.');
  return ctx.connector;
}

function customer(ctx: ToolContext): CustomerIdentity {
  if (!ctx.customer) throw new Error('The customer is not signed in.');
  return ctx.customer;
}

const createTicket: ToolDefinition<{ subject: string; summary: string; priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' }> = {
  name: 'create_ticket',
  label: 'Create ticket',
  description:
    'Hand the conversation to the human support team by opening a ticket. Use it when the customer asks for a person, ' +
    'when you cannot resolve the issue with the sources and tools you have, or when the issue needs follow-up.',
  sensitive: false,
  requiresCustomer: false,
  requiresConnector: false,
  parameters: {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'Short summary of the issue, under 100 characters.' },
      summary: { type: 'string', description: 'What the customer needs and what has been tried so far.' },
      priority: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] },
    },
    required: ['subject', 'summary', 'priority'],
    additionalProperties: false,
  },
  input: z.object({
    subject: z.string().trim().min(3).max(200),
    summary: z.string().trim().min(1).max(4000),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  }),
  summarize: (i) => `Open a ticket: ${i.subject}`,
  run: async (ctx, i) => {
    const { ticketNumber, existing } = await ctx.createTicket(i);
    return {
      ticketNumber,
      message: existing
        ? `This conversation already has ticket #${ticketNumber}; the team is on it.`
        : `Ticket #${ticketNumber} created. A team member will reply in this chat.`,
    };
  },
};

const getCustomerProfile: ToolDefinition<Record<string, never>> = {
  name: 'get_customer_profile',
  label: 'Look up customer',
  description: "Get the signed-in customer's profile: name, email, customer since, loyalty tier.",
  sensitive: false,
  requiresCustomer: true,
  requiresConnector: true,
  parameters: noParameters,
  input: z.object({}).strict(),
  summarize: () => 'Look up the customer profile',
  run: (ctx) => connector(ctx).getCustomerProfile(customer(ctx)),
};

const getSubscription: ToolDefinition<Record<string, never>> = {
  name: 'get_subscription',
  label: 'Look up subscription',
  description: "Get the signed-in customer's subscription: plan, price, status, renewal or end date.",
  sensitive: false,
  requiresCustomer: true,
  requiresConnector: true,
  parameters: noParameters,
  input: z.object({}).strict(),
  summarize: () => 'Look up the subscription',
  run: (ctx) => connector(ctx).getSubscription(customer(ctx)),
};

const listOrders: ToolDefinition<Record<string, never>> = {
  name: 'list_orders',
  label: 'List orders',
  description: "List the signed-in customer's recent orders with ids, items, totals and status.",
  sensitive: false,
  requiresCustomer: true,
  requiresConnector: true,
  parameters: noParameters,
  input: z.object({}).strict(),
  summarize: () => 'List recent orders',
  run: (ctx) => connector(ctx).listOrders(customer(ctx)),
};

const requestRefund: ToolDefinition<{ orderId: string; amountCents: number | null; reason: string }> = {
  name: 'request_refund',
  label: 'Refund an order',
  description:
    'Request a refund for one of the signed-in customer\'s orders (use list_orders to find the order id). ' +
    'This needs approval from the support team: tell the customer it is pending review, never that it is done.',
  sensitive: true,
  requiresCustomer: true,
  requiresConnector: true,
  parameters: {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: 'The order id, e.g. ORD-1A2B3C.' },
      amountCents: {
        type: ['integer', 'null'],
        description: 'Amount to refund in cents for a partial refund, or null for the full order total.',
      },
      reason: { type: 'string', description: "The customer's reason, in their words." },
    },
    required: ['orderId', 'amountCents', 'reason'],
    additionalProperties: false,
  },
  input: z.object({
    orderId: z.string().trim().min(1).max(64),
    amountCents: z.number().int().positive().max(10_000_000).nullable(),
    reason: z.string().trim().min(1).max(1000),
  }),
  summarize: (i) =>
    `Refund ${i.amountCents ? money(i.amountCents) : 'the full amount'} for order ${i.orderId} (reason: ${i.reason})`,
  run: (ctx, i) =>
    connector(ctx).requestRefund(customer(ctx), {
      orderId: i.orderId,
      amountCents: i.amountCents ?? undefined,
      reason: i.reason,
    }),
};

const cancelSubscription: ToolDefinition<{ atPeriodEnd: boolean; reason: string }> = {
  name: 'cancel_subscription',
  label: 'Cancel subscription',
  description:
    "Cancel the signed-in customer's subscription, at the end of the billing period (default) or immediately if they insist. " +
    'This needs approval from the support team: tell the customer it is pending review, never that it is done.',
  sensitive: true,
  requiresCustomer: true,
  requiresConnector: true,
  parameters: {
    type: 'object',
    properties: {
      atPeriodEnd: { type: 'boolean', description: 'True to keep access until the end of the paid period.' },
      reason: { type: 'string', description: "The customer's reason, in their words." },
    },
    required: ['atPeriodEnd', 'reason'],
    additionalProperties: false,
  },
  input: z.object({ atPeriodEnd: z.boolean(), reason: z.string().trim().min(1).max(1000) }),
  summarize: (i) =>
    `Cancel the subscription ${i.atPeriodEnd ? 'at the end of the billing period' : 'immediately'} (reason: ${i.reason})`,
  run: (ctx, i) => connector(ctx).cancelSubscription(customer(ctx), i),
};

export const TOOLS: ToolDefinition<any>[] = [
  createTicket,
  getCustomerProfile,
  getSubscription,
  listOrders,
  requestRefund,
  cancelSubscription,
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
