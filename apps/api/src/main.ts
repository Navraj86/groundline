import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  // rawBody keeps the exact request bytes, which webhook signatures are computed over.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);

  const port = app.get<ConfigService<Env, true>>(ConfigService).get('API_PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
}
await bootstrap();
