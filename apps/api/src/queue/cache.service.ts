import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service.js';

const PREFIX = 'groundline:cache:';

/** Read-through JSON cache on Redis. When Redis is unavailable it just computes the value. */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redis: RedisService) {}

  async getOrSet<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    const fullKey = PREFIX + key;
    try {
      const cached = await this.redis.client.get(fullKey);
      if (cached !== null) return JSON.parse(cached) as T;
    } catch {
      // Cache miss in effect.
    }
    const value = await compute();
    try {
      await this.redis.client.set(fullKey, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.debug(`Cache write skipped: ${(err as Error).message}`);
    }
    return value;
  }

  /** Drops every cached entry whose key starts with `prefix`. */
  async invalidate(prefix: string): Promise<void> {
    try {
      const stream = this.redis.client.scanStream({ match: `${PREFIX}${prefix}*`, count: 100 });
      for await (const keys of stream as AsyncIterable<string[]>) {
        if (keys.length) await this.redis.client.unlink(...keys);
      }
    } catch {
      // Entries expire on their own.
    }
  }
}
