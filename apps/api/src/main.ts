import { Logger, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
  // The web app calls the API server-to-server; CORS only matters for the future chat widget
  // and local tooling, so allow the configured web origin.
  app.enableCors({ origin: config.get('WEB_URL', { infer: true }), credentials: true });

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
}
await bootstrap();
