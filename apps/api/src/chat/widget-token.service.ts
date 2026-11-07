import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type { Env } from '../config/env.js';

const AUDIENCE = 'groundline-widget';
const LIFETIME = '30d';

export interface VisitorClaims {
  conversationId: string;
  organizationId: string;
}

/**
 * Signs the tokens widget visitors use to read and post to their own conversation.
 * A token is scoped to a single conversation, so leaking it exposes nothing else.
 */
@Injectable()
export class WidgetTokenService {
  private readonly secret: Uint8Array;

  constructor(config: ConfigService<Env, true>) {
    const configured = config.get('WIDGET_TOKEN_SECRET', { infer: true });
    if (!configured) {
      new Logger(WidgetTokenService.name).warn(
        'WIDGET_TOKEN_SECRET is not set; widget sessions will not survive an API restart.',
      );
    }
    this.secret = new TextEncoder().encode(configured || randomBytes(32).toString('hex'));
  }

  issue(claims: VisitorClaims): Promise<string> {
    return new SignJWT({ org: claims.organizationId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.conversationId)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(LIFETIME)
      .sign(this.secret);
  }

  async verify(header: string | undefined, conversationId: string): Promise<VisitorClaims> {
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Missing visitor token');
    try {
      const { payload } = await jwtVerify(token, this.secret, { audience: AUDIENCE, algorithms: ['HS256'] });
      if (payload.sub !== conversationId || typeof payload.org !== 'string') throw new Error('scope');
      return { conversationId, organizationId: payload.org };
    } catch {
      throw new UnauthorizedException('This chat session has expired. Start a new conversation.');
    }
  }
}
