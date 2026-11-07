import { Controller, Headers, HttpCode, HttpStatus, Post, Req, type RawBodyRequest } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/decorators.js';
import { WebhookProcessor, type WebhookHeaders, type WebhookResult } from './webhook-processor.service.js';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly processor: WebhookProcessor) {}

  /** Dodo Payments events. Authenticated by signature, not by user session. */
  @Public()
  @SkipThrottle()
  @Post('dodo')
  @HttpCode(HttpStatus.OK)
  dodo(@Req() req: RawBodyRequest<Request>, @Headers() headers: WebhookHeaders): Promise<WebhookResult> {
    return this.processor.handle(req.rawBody, headers);
  }
}
