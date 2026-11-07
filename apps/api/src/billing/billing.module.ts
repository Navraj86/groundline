import { Global, Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { DodoService } from './dodo.service.js';
import { EntitlementsService } from './entitlements.service.js';
import { PlansController } from './plans.controller.js';
import { PlansService } from './plans.service.js';
import { SubscriptionSyncService } from './subscription-sync.service.js';

@Global()
@Module({
  controllers: [PlansController, BillingController],
  providers: [PlansService, EntitlementsService, DodoService, SubscriptionSyncService, BillingService],
  exports: [PlansService, EntitlementsService],
})
export class BillingModule {}
