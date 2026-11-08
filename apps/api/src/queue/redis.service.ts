import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.js';

/**
 * Shared Redis client for caching and health checks. Commands fail fast instead of
 * queueing while Redis is down, so callers can fall back to the database.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: ConfigService<Env, true>) {
    this.client = new Redis(config.get('REDIS_URL', { infer: true }), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      // Keep reconnecting in the background, but not in a tight loop.
      retryStrategy: (times) => Math.min(times * 500, 10_000),
    });
    let reported = false;
    this.client.on('error', (err) => {
      if (!reported) this.logger.warn(`Redis unavailable: ${err.message}`);
      reported = true;
    });
    this.client.on('ready', () => {
      reported = false;
      this.logger.log('Connected to Redis');
    });
    this.client.connect().catch(() => undefined);
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}
