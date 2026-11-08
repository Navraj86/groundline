import { z } from 'zod';
import type { ToolCallView } from './agent.js';

export const CONVERSATION_STATUSES = ['OPEN', 'ESCALATED', 'RESOLVED'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
export type ConversationChannel = 'WIDGET' | 'PLAYGROUND';
export type MessageRole = 'CUSTOMER' | 'ASSISTANT' | 'AGENT';
export type AnswerStatus = 'ANSWERED' | 'INSUFFICIENT_CONTEXT' | 'ERROR';

export interface AnswerSource {
  index: number;
  sourceId: string;
  title: string;
  url: string | null;
  pages: number[];
  snippet: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  answerStatus: AnswerStatus | null;
  sources: AnswerSource[];
  createdAt: string;
  /** Present for team members viewing a conversation; omitted for widget visitors. */
  meta?: {
    provider: string | null;
    model: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    latencyMs: number | null;
  };
}

export interface ConversationSummary {
  id: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  title: string | null;
  visitorName: string | null;
  visitorEmail: string | null;
  messageCount: number;
  lastMessage: { role: MessageRole; content: string } | null;
  lastMessageAt: string;
  createdAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ChatMessage[];
  /** Whether the visitor's identity was verified with a signed token. */
  verified: boolean;
  /** Sensitive actions waiting for approval; the widget keeps polling while any are pending. */
  pendingApprovals: number;
  /** Tools the assistant used (team view only). */
  toolCalls?: ToolCallView[];
  escalatedAt: string | null;
  resolvedAt: string | null;
}

export interface AssistantSettings {
  name: string;
  greeting: string;
  instructions: string;
  brandColor: string;
}

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  name: 'Support Assistant',
  greeting: 'Hi! Ask me anything about our product, billing or policies.',
  instructions: '',
  brandColor: '#18181b',
};

export interface AssistantConfig {
  settings: AssistantSettings;
  widgetKey: string;
}

/** What the public widget needs to render. */
export interface WidgetConfig {
  organizationName: string;
  assistantName: string;
  greeting: string;
  brandColor: string;
}

export interface WidgetSession {
  conversation: ConversationDetail;
  /** Bearer token that lets this visitor read and post to this conversation only. */
  visitorToken: string;
}

export interface SendMessageResult {
  message: ChatMessage;
  /** The assistant's reply, or null when the conversation is with a human. */
  reply: ChatMessage | null;
  status: ConversationStatus;
}

export const assistantSettingsSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60),
  greeting: z.string().trim().max(300),
  instructions: z.string().trim().max(2000),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #2563eb'),
});
export type AssistantSettingsInput = z.infer<typeof assistantSettingsSchema>;

export const startConversationSchema = z.object({
  visitorId: z.string().trim().min(8).max(100).optional(),
  name: z.string().trim().max(100).optional(),
  email: z.email().trim().toLowerCase().max(254).optional(),
  channel: z.enum(['WIDGET', 'PLAYGROUND']).default('WIDGET'),
  /** JWT signed by the organization's server with its identity secret (sub, email, name). */
  userToken: z.string().max(4096).optional(),
});
export type StartConversationInput = z.infer<typeof startConversationSchema>;

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1, 'Type a message').max(4000, 'Messages can be up to 4,000 characters'),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const escalateSchema = z.object({
  email: z.email('Enter a valid email address').trim().toLowerCase().max(254).optional(),
  note: z.string().trim().max(2000).optional(),
});
export type EscalateInput = z.infer<typeof escalateSchema>;

export const updateConversationSchema = z.object({ status: z.enum(['OPEN', 'RESOLVED']) });
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
