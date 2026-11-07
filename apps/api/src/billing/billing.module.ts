import { Global, Module } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service.js';
import { PlansController } from './plans.controller.js';
import { PlansService } from './plans.service.js';

@Global()
@Module({
  controllers: [PlansController],
  providers: [PlansService, EntitlementsService],
  exports: [PlansService, EntitlementsService],
})
export class BillingModule {}
