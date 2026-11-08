import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueueService } from '../queue/queue.service.js';
import { RedisService } from '../queue/redis.service.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queues: QueueService,
  ) {}

  /** Liveness: the process is up. */
  @Get()
  live() {
    return { status: 'ok' };
  }

  /**
   * Readiness: the database is required to serve traffic. Redis only backs caching and
   * background jobs, so when it's down the API still serves requests and reports "degraded".
   */
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable', database: 'down' });
    }
    if (!(await this.redis.ping())) return { status: 'degraded', database: 'up', redis: 'down' };
    const queues = await this.queues.counts().catch(() => null);
    return { status: 'ok', database: 'up', redis: 'up', workers: this.queues.workersEnabled, queues };
  }
}
