import { createHmac } from 'node:crypto';
import {
  ConnectorError,
  type CancelSubscriptionInput,
  type CommerceConnector,
  type CustomerIdentity,
  type RefundInput,
} from './connector.js';

const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

/**
 * Calls the organization's own backend. Each action is a POST to `{baseUrl}/{action}`
 * with JSON `{ organizationId, customer, input }` and a signature header:
 *
 *   X-Groundline-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
 *
 * The backend verifies the signature with the shared secret, rejects stale timestamps,
 * and answers with JSON. 4xx responses with `{ "error": "..." }` are shown to the model.
 */
export class ActionsApiConnector implements CommerceConnector {
  readonly kind = 'ACTIONS_API' as const;

  constructor(
    private readonly organizationId: string,
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  getCustomerProfile(customer: CustomerIdentity) {
    return this.call('get_customer_profile', customer, {});
  }

  getSubscription(customer: CustomerIdentity) {
    return this.call('get_subscription', customer, {});
  }

  listOrders(customer: CustomerIdentity) {
    return this.call('list_orders', customer, {});
  }

  requestRefund(customer: CustomerIdentity, input: RefundInput) {
    return this.call('request_refund', customer, input);
  }

  cancelSubscription(customer: CustomerIdentity, input: CancelSubscriptionInput) {
    return this.call('cancel_subscription', customer, input);
  }

  private async call(action: string, customer: CustomerIdentity, input: object): Promise<unknown> {
    const body = JSON.stringify({
      organizationId: this.organizationId,
      customer: { id: customer.externalId, email: customer.email, name: customer.name },
      input,
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', this.secret).update(`${timestamp}.${body}`).digest('hex');

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/${action}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Groundline-Actions/1.0',
          'x-groundline-signature': `t=${timestamp},v1=${signature}`,
        },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`The company's system didn't respond (${(err as Error).message}).`);
    }

    const text = await res.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new Error('The response from the company system was too large.');
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`The company's system returned invalid JSON (HTTP ${res.status}).`);
    }
    if (res.status >= 400 && res.status < 500) {
      const message = (data as { error?: string } | null)?.error;
      throw new ConnectorError(message ?? `The company's system rejected the request (HTTP ${res.status}).`);
    }
    if (!res.ok) throw new Error(`The company's system failed (HTTP ${res.status}).`);
    return data;
  }
}
