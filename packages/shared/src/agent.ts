import { z } from 'zod';
import type { UserRef } from './types.js';

export const AGENT_TOOL_NAMES = [
  'create_ticket',
  'get_customer_profile',
  'get_subscription',
  'list_orders',
  'request_refund',
  'cancel_subscription',
] as const;
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export type ToolCallStatus = 'SUCCEEDED' | 'FAILED' | 'BLOCKED' | 'PENDING_APPROVAL' | 'REJECTED';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface ToolInfo {
  name: AgentToolName;
  label: string;
  description: string;
  /** Sensitive tools always wait for an owner or admin to approve (BR-007). */
  sensitive: boolean;
  /** Needs a verified customer: acts only on the signed-in customer's own account. */
  requiresCustomer: boolean;
  enabled: boolean;
}

export interface ToolCallView {
  id: string;
  tool: string;
  label: string;
  input: Record<string, unknown>;
  output: unknown;
  status: ToolCallStatus;
  sensitive: boolean;
  error: string | null;
  durationMs: number | null;
  conversationId: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ApprovalView {
  id: string;
  status: ApprovalStatus;
  summary: string;
  tool: string;
  toolLabel: string;
  input: Record<string, unknown>;
  /** The action's result once approved (or the error if it failed). */
  result: { status: ToolCallStatus; output: unknown; error: string | null };
  conversationId: string | null;
  ticketNumber: number | null;
  customer: { externalId: string; email: string | null; name: string | null } | null;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  decidedBy: UserRef | null;
  decisionNote: string | null;
}

export interface IdentitySettings {
  enabled: boolean;
  /** Shown to owners so they can sign tokens on their own server. */
  secret: string | null;
}

export type IntegrationKind = 'SANDBOX' | 'ACTIONS_API';

export interface IntegrationView {
  kind: IntegrationKind;
  enabled: boolean;
  baseUrl: string | null;
  /** The Actions API signing secret, for the owner to verify requests with. */
  secret: string | null;
  updatedAt: string | null;
}

export const decideApprovalSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().max(1000).optional(),
});
export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>;

export const updateToolsSchema = z.object({
  tools: z.partialRecord(z.enum(AGENT_TOOL_NAMES), z.boolean()),
});
export type UpdateToolsInput = z.infer<typeof updateToolsSchema>;

export const sandboxIntegrationSchema = z.object({ enabled: z.boolean() });
export type SandboxIntegrationInput = z.infer<typeof sandboxIntegrationSchema>;

export const actionsApiIntegrationSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.url({ protocol: /^https?$/, error: 'Enter your API base URL (https://...)' }).trim().max(500),
});
export type ActionsApiIntegrationInput = z.infer<typeof actionsApiIntegrationSchema>;
