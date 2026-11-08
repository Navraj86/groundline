import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AnswerSource } from '@groundline/shared';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueueService } from '../queue/queue.service.js';
import { QUEUES } from '../queue/queues.js';
import { AiClient } from './ai-client.service.js';

interface ReviewJob {
  messageId: string;
}

/**
 * Hallucination monitoring: a sample of live answers is checked in the background against
 * the full text of the sources they cite, and the scores are stored on the message.
 */
@Injectable()
export class AnswerReviewService implements OnModuleInit {
  private readonly logger = new Logger(AnswerReviewService.name);
  private readonly sampleRate: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClient,
    private readonly queues: QueueService,
    config: ConfigService<Env, true>,
  ) {
    this.sampleRate = config.get('ANSWER_REVIEW_SAMPLE_RATE', { infer: true });
  }

  onModuleInit(): void {
    this.queues.handle<ReviewJob>(QUEUES.answerReviews, 'review-answer', (job) => this.review(job.messageId));
  }

  /** Queues a review for a sampled share of cited answers. Never throws: replies must not fail over this. */
  async maybeEnqueue(message: { id: string; answerStatus: string | null; sources: unknown }): Promise<void> {
    const sources = (message.sources as AnswerSource[] | null) ?? [];
    if (message.answerStatus !== 'ANSWERED' || !sources.some((s) => s.chunkId)) return;
    if (Math.random() >= this.sampleRate) return;
    try {
      // The job id makes re-queuing the same message a no-op.
      await this.queues.add<ReviewJob>(QUEUES.answerReviews, 'review-answer', { messageId: message.id }, { jobId: message.id });
    } catch (err) {
      this.logger.warn(`Could not queue answer review: ${(err as Error).message}`);
    }
  }

  async review(messageId: string): Promise<{ groundedness: number } | null> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.reviewedAt) return null;
    const question = await this.prisma.message.findFirst({
      where: { conversationId: message.conversationId, role: 'CUSTOMER', createdAt: { lte: message.createdAt } },
      orderBy: { createdAt: 'desc' },
    });
    const chunkIds = ((message.sources as unknown as AnswerSource[]) ?? []).flatMap((s) => (s.chunkId ? [s.chunkId] : []));
    if (!question || chunkIds.length === 0) return null;

    const grade = await this.ai.gradeAnswer({
      organizationId: message.organizationId,
      question: question.content,
      answer: message.content,
      chunkIds,
    });
    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        groundedness: grade.groundedness,
        relevance: grade.relevance,
        unsupportedClaims: grade.unsupported_claims as Prisma.InputJsonValue,
        reviewNotes: grade.notes || null,
        reviewJudge: grade.judge,
        reviewTokens: grade.input_tokens + grade.output_tokens || null,
        reviewedAt: new Date(),
      },
    });
    return { groundedness: grade.groundedness };
  }
}
