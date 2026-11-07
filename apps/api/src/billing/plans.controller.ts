import { Controller, Get } from '@nestjs/common';
import type { PlanInfo } from '@groundline/shared';
import { Public } from '../auth/decorators.js';
import { PlansService } from './plans.service.js';

@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  /** The public plan catalog, for the pricing page. */
  @Public()
  @Get()
  list(): Promise<PlanInfo[]> {
    return this.plans.listPublic();
  }
}
