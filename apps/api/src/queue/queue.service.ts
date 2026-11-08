import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job, type JobsOptions } from 'bullmq';
import type { Env } from '../config/env.js';
import { QUEUES, type QueueName } from './queues.js';

export type JobHandler<T = unknown> = (data: T, job: Job) => Promise<unknown>;

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

/** How many jobs of each queue a worker process runs at once. */
const CONCURRENCY: Record<QueueName, number> = {
  [QUEUES.evaluations]: 2,
  [QUEUES.answerReviews]: 4,
  [QUEUES.maintenance]: 1,
};

/**
 * BullMQ queues on Redis. Feature modules register a handler per job name during
 * `onModuleInit`; when this process runs workers (WORKERS_ENABLED), one worker per
 * queue starts at bootstrap and dispatches jobs to those handlers.
 */
@Injectable()
export class QueueService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly connection: { url: string; maxRetriesPerRequest: null };
  private readonly queues = new Map<QueueName, Queue>();
  private readonly workers: Worker[] = [];
  private readonly handlers = new Map<QueueName, Map<string, JobHandler>>();
  private readonly schedules: { queue: QueueName; id: string; everyMs: number }[] = [];
  readonly workersEnabled: boolean;

  constructor(config: ConfigService<Env, true>) {
    // BullMQ's blocking commands need unlimited retries on the worker connection.
    this.connection = { url: config.get('REDIS_URL', { infer: true }), maxRetriesPerRequest: null };
    this.workersEnabled = config.get('WORKERS_ENABLED', { infer: true });
  }

  queue(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection: this.connection,
        prefix: 'groundline',
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      queue.on('error', (err) => this.logger.warn(`Queue ${name}: ${err.message}`));
      this.queues.set(name, queue);
    }
    return queue;
  }

  async add<T>(name: QueueName, jobName: string, data: T, opts?: JobsOptions): Promise<void> {
    await this.queue(name).add(jobName, data, opts);
  }

  /** Registers the function that processes `jobName` jobs on `queue`. */
  handle<T>(queue: QueueName, jobName: string, handler: JobHandler<T>): void {
    const byName = this.handlers.get(queue) ?? new Map<string, JobHandler>();
    byName.set(jobName, handler as JobHandler);
    this.handlers.set(queue, byName);
  }

  /** Runs `jobName` on `queue` every `everyMs` (one schedule cluster-wide, however many workers run). */
  schedule(queue: QueueName, jobName: string, everyMs: number): void {
    this.schedules.push({ queue, id: jobName, everyMs });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.workersEnabled) return;
    for (const [name, byName] of this.handlers) {
      const worker = new Worker(
        name,
        async (job) => {
          const handler = byName.get(job.name);
          if (!handler) throw new Error(`No handler for ${name}/${job.name}`);
          return handler(job.data, job);
        },
        { connection: this.connection, prefix: 'groundline', concurrency: CONCURRENCY[name] },
      );
      worker.on('failed', (job, err) =>
        this.logger.warn(`Job ${name}/${job?.name} ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`),
      );
      worker.on('error', (err) => this.logger.warn(`Worker ${name}: ${err.message}`));
      this.workers.push(worker);
    }
    for (const s of this.schedules) {
      try {
        await this.queue(s.queue).upsertJobScheduler(s.id, { every: s.everyMs }, { name: s.id });
      } catch (err) {
        this.logger.warn(`Could not schedule ${s.queue}/${s.id}: ${(err as Error).message}`);
      }
    }
    this.logger.log(`Workers started for: ${[...this.handlers.keys()].join(', ') || 'none'}`);
  }

  /** Job counts per queue, for readiness checks and monitoring. */
  async counts(): Promise<Record<string, Record<string, number>>> {
    const out: Record<string, Record<string, number>> = {};
    for (const name of Object.values(QUEUES)) {
      out[name] = await this.queue(name).getJobCounts('waiting', 'active', 'delayed', 'failed');
    }
    return out;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(this.workers.map((w) => w.close()));
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
  }
}
