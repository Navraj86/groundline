import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service.js';
import { QueueService } from './queue.service.js';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [RedisService, CacheService, QueueService],
  exports: [RedisService, CacheService, QueueService],
})
export class QueueModule {}
