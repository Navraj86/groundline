import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import DodoPayments from 'dodopayments';
import type { Env } from '../config/env.js';

/**
 * Thin wrapper around the Dodo Payments SDK. Billing is optional in development: without an
 * API key the client is absent and billing endpoints answer 503 instead of crashing.
 */
@Injectable()
export class DodoService {
  private readonly logger = new Logger(DodoService.name);
  private readonly client: DodoPayments | null;
  readonly webhookKey: string;

  constructor(config: ConfigService<Env, true>) {
    const apiKey = config.get('DODO_PAYMENTS_API_KEY', { infer: true });
    this.webhookKey = config.get('DODO_PAYMENTS_WEBHOOK_KEY', { infer: true });
    this.client = apiKey
      ? new DodoPayments({
          bearerToken: apiKey,
          environment: config.get('DODO_PAYMENTS_ENVIRONMENT', { infer: true }),
          maxRetries: 2,
          timeout: 20_000,
        })
      : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /** Runs a provider call, translating SDK errors into HTTP errors the web app can show. */
  async call<T>(operation: string, fn: (client: DodoPayments) => Promise<T>): Promise<T> {
    if (!this.client) {
      throw new ServiceUnavailableException('Billing is not configured for this environment.');
    }
    try {
      return await fn(this.client);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      if (err instanceof DodoPayments.APIError) {
        this.logger.error(`Dodo Payments ${operation} failed (${err.status}): ${err.message}`);
        throw new BadGatewayException(`The payment provider rejected the request: ${providerMessage(err)}`);
      }
      this.logger.error(`Dodo Payments ${operation} failed: ${(err as Error).message}`);
      throw new BadGatewayException('The payment provider is unavailable. Try again shortly.');
    }
  }
}

function providerMessage(err: InstanceType<typeof DodoPayments.APIError>): string {
  const body = err.error as { message?: string } | undefined;
  return body?.message ?? err.message;
}
