import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  changePlanSchema,
  checkoutSchema,
  type BillingActionResult,
  type BillingOverview,
  type ChangePlanInput,
  type CheckoutInput,
  type CheckoutResult,
  type PaymentRecord,
  type PortalResult,
} from '@groundline/shared';
import type { AuthContext, OrgContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { CurrentOrg, OrgScoped } from '../organizations/org-access.js';
import { BillingService } from './billing.service.js';

// Each of these calls the payment provider; keep clients from hammering it.
const PROVIDER_LIMIT = { default: { limit: 20, ttl: 60_000 } };

@Controller('orgs/:orgId/billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @OrgScoped('billing:read')
  overview(@CurrentOrg() org: OrgContext): Promise<BillingOverview> {
    return this.billing.overview(org);
  }

  @Get('payments')
  @OrgScoped('billing:read')
  payments(@CurrentOrg() org: OrgContext): Promise<PaymentRecord[]> {
    return this.billing.payments(org);
  }

  @Post('checkout')
  @OrgScoped('billing:manage')
  @Throttle(PROVIDER_LIMIT)
  checkout(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Body({ schema: checkoutSchema }) body: CheckoutInput,
  ): Promise<CheckoutResult> {
    return this.billing.checkout(org, user, body.planKey);
  }

  @Post('change-plan')
  @OrgScoped('billing:manage')
  @Throttle(PROVIDER_LIMIT)
  @HttpCode(HttpStatus.ACCEPTED)
  changePlan(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Body({ schema: changePlanSchema }) body: ChangePlanInput,
  ): Promise<BillingActionResult> {
    return this.billing.changePlan(org, user, body.planKey);
  }

  @Post('cancel')
  @OrgScoped('billing:manage')
  @Throttle(PROVIDER_LIMIT)
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthContext): Promise<BillingActionResult> {
    return this.billing.cancel(org, user);
  }

  @Post('resume')
  @OrgScoped('billing:manage')
  @Throttle(PROVIDER_LIMIT)
  @HttpCode(HttpStatus.OK)
  resume(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthContext): Promise<BillingActionResult> {
    return this.billing.resume(org, user);
  }

  @Post('portal')
  @OrgScoped('billing:manage')
  @Throttle(PROVIDER_LIMIT)
  @HttpCode(HttpStatus.OK)
  portal(@CurrentOrg() org: OrgContext): Promise<PortalResult> {
    return this.billing.portal(org);
  }

  @Post('sync')
  @OrgScoped('billing:read')
  @Throttle(PROVIDER_LIMIT)
  @HttpCode(HttpStatus.OK)
  sync(@CurrentOrg() org: OrgContext): Promise<BillingOverview> {
    return this.billing.reconcile(org);
  }
}
