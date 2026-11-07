import { type INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './config/env.js';

/** Application-wide setup shared by main.ts and the end-to-end tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Rate limits key on the client IP; trust the proxy in front (the web app, a load balancer).
  app.getHttpAdapter().getInstance().set('trust proxy', parseTrustProxy(config.get('TRUST_PROXY', { infer: true })));
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
  // The web app calls the API server-to-server; CORS only matters for local tooling.
  app.enableCors({ origin: config.get('WEB_URL', { infer: true }), credentials: true });
}

function parseTrustProxy(value: string): boolean | number | string {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}
