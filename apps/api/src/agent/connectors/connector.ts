/** The verified customer an action is performed for. Tools never act on anyone else. */
export interface CustomerIdentity {
  customerId: string;
  externalId: string;
  email: string | null;
  name: string | null;
}

export interface RefundInput {
  orderId: string;
  /** Partial refund in cents; omitted for a full refund. */
  amountCents?: number;
  reason: string;
}

export interface CancelSubscriptionInput {
  atPeriodEnd: boolean;
  reason: string;
}

/** A business system the agent can read from and act on, on behalf of one customer. */
export interface CommerceConnector {
  readonly kind: 'SANDBOX' | 'ACTIONS_API';
  getCustomerProfile(customer: CustomerIdentity): Promise<unknown>;
  getSubscription(customer: CustomerIdentity): Promise<unknown>;
  listOrders(customer: CustomerIdentity): Promise<unknown>;
  requestRefund(customer: CustomerIdentity, input: RefundInput): Promise<unknown>;
  cancelSubscription(customer: CustomerIdentity, input: CancelSubscriptionInput): Promise<unknown>;
}

/** A problem the model should hear about (and can explain), rather than a crash. */
export class ConnectorError extends Error {}
