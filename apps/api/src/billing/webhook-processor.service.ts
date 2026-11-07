import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Payment as DodoPayment, Subscription as DodoSubscription } from 'dodopayments/resources';
import { Webhook } from 'standardwebhooks';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation } from '../organizations/organizations.service.js';
import { DodoService } from './dodo.service.js';
import { SubscriptionSyncService, type SyncOutcome } from './subscription-sync.service.js';

export interface DodoWebhookEvent {
  business_id: string;
  type: string;
  timestamp: string;
  data: { payload_type?: string } & Record<string, unknown>;
}

export interface WebhookHeaders {
  'webhook-id'?: string;
  'webhook-signature'?: string;
  'webhook-timestamp'?: string;
}

export type WebhookResult = { received: true; status: 'processed' | 'ignored' | 'duplicate' };

/**
 * Handles Dodo Payments webhooks:
 * 1. verifies the Standard Webhooks signature and timestamp (BR-010),
 * 2. records the delivery by webhook-id so retries and replays are applied once (BR-011),
 * 3. applies the event and marks it processed in the same transaction.
 * A failure leaves the event FAILED and returns 5xx so the provider retries it.
 */
@Injectable()
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);
  private readonly verifier: Webhook | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SubscriptionSyncService,
    dodo: DodoService,
  ) {
    this.verifier = dodo.webhookKey ? new Webhook(dodo.webhookKey) : null;
  }

  async handle(rawBody: Buffer | undefined, headers: WebhookHeaders): Promise<WebhookResult> {
    if (!this.verifier) throw new ServiceUnavailableException('Webhooks are not configured.');
    const webhookId = headers['webhook-id'];
    if (!rawBody || !webhookId) throw new UnauthorizedException('Missing webhook signature headers');

    let event: DodoWebhookEvent;
    try {
      event = this.verifier.verify(rawBody, {
        'webhook-id': webhookId,
        'webhook-signature': headers['webhook-signature'] ?? '',
        'webhook-timestamp': headers['webhook-timestamp'] ?? '',
      }) as DodoWebhookEvent;
    } catch {
      this.logger.warn(`Rejected webhook ${webhookId}: invalid signature or timestamp`);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const occurredAt = parseTimestamp(event.timestamp);
    const record = await this.record(webhookId, event, occurredAt);
    if (record === 'done') return { received: true, status: 'duplicate' };

    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        const result = await this.apply(event, occurredAt, tx);
        await tx.paymentEvent.update({
          where: { webhookId },
          data: {
            status: result.applied ? 'PROCESSED' : 'IGNORED',
            error: result.applied ? null : result.reason,
            organizationId: result.organizationId,
            processedAt: new Date(),
          },
        });
        return result;
      });
      if (!outcome.applied) this.logger.log(`Ignored ${event.type} (${webhookId}): ${outcome.reason}`);
      return { received: true, status: outcome.applied ? 'processed' : 'ignored' };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Failed to process ${event.type} (${webhookId}): ${message}`);
      await this.prisma.paymentEvent
        .update({ where: { webhookId }, data: { status: 'FAILED', error: message.slice(0, 1000) } })
        .catch(() => undefined);
      throw new InternalServerErrorException('Webhook processing failed; it will be retried.');
    }
  }

  /**
   * Stores the delivery, or reports that it was already handled. A delivery still in
   * progress elsewhere gets 409 so the provider retries it later rather than losing it.
   */
  private async record(webhookId: string, event: DodoWebhookEvent, occurredAt: Date): Promise<'new' | 'done'> {
    const data = event.data;
    const refs = {
      dodoSubscriptionId: typeof data.subscription_id === 'string' ? data.subscription_id : null,
      dodoPaymentId: typeof data.payment_id === 'string' ? data.payment_id : null,
    };
    try {
      await this.prisma.paymentEvent.create({
        data: {
          webhookId,
          type: event.type,
          occurredAt,
          payload: event as unknown as Prisma.InputJsonValue,
          ...refs,
        },
      });
      return 'new';
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }

    const existing = await this.prisma.paymentEvent.findUniqueOrThrow({ where: { webhookId } });
    if (existing.status === 'PROCESSED' || existing.status === 'IGNORED') return 'done';
    if (existing.status === 'RECEIVED' && Date.now() - existing.createdAt.getTime() < 60_000) {
      throw new ConflictException('This webhook is already being processed.');
    }
    // A previous attempt failed (or stalled): try again.
    await this.prisma.paymentEvent.update({
      where: { webhookId },
      data: { attempts: { increment: 1 }, status: 'RECEIVED', error: null },
    });
    return 'new';
  }

  private apply(event: DodoWebhookEvent, occurredAt: Date, tx: Prisma.TransactionClient): Promise<SyncOutcome> {
    if (event.type.startsWith('subscription.')) {
      return this.sync.applySubscription(event.data as unknown as DodoSubscription, occurredAt, tx);
    }
    if (event.type.startsWith('payment.')) {
      return this.sync.applyPayment(event.data as unknown as DodoPayment, occurredAt, tx);
    }
    return Promise.resolve({ applied: false, organizationId: null, reason: `unhandled event type ${event.type}` });
  }
}

function parseTimestamp(value: string | undefined): Date {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
