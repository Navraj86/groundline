import { Logger, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  // rawBody keeps the exact request bytes, which webhook signatures are computed over.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Rate limits key on the client IP; trust the proxy in front (the web app, a load balancer).
  app.getHttpAdapter().getInstance().set('trust proxy', parseTrustProxy(config.get('TRUST_PROXY', { infer: true })));
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
  // The web app calls the API server-to-server; CORS only matters for the future chat widget
  // and local tooling, so allow the configured web origin.
  app.enableCors({ origin: config.get('WEB_URL', { infer: true }), credentials: true });

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
}
function parseTrustProxy(value: string): boolean | number | string {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

await bootstrap();
