import { Global, Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { DodoService } from './dodo.service.js';
import { EntitlementsService } from './entitlements.service.js';
import { PlansController } from './plans.controller.js';
import { PlansService } from './plans.service.js';
import { SubscriptionSyncService } from './subscription-sync.service.js';
import { WebhookProcessor } from './webhook-processor.service.js';
import { WebhooksController } from './webhooks.controller.js';

@Global()
@Module({
  controllers: [PlansController, BillingController, WebhooksController],
  providers: [PlansService, EntitlementsService, DodoService, SubscriptionSyncService, BillingService, WebhookProcessor],
  exports: [PlansService, EntitlementsService],
})
export class BillingModule {}
