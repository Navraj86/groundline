import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

/**
 * Worker-only process: runs background jobs without serving HTTP. In production, run the
 * API with WORKERS_ENABLED=false and scale this process separately.
 */
process.env.WORKERS_ENABLED = 'true';
const { AppModule } = await import('./app.module.js');

const app = await NestFactory.createApplicationContext(AppModule);
app.enableShutdownHooks();
Logger.log('Worker running', 'Bootstrap');
