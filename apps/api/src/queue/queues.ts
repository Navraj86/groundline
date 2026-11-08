/** Background job queues. Each is processed by the worker role (see main.ts and worker.ts). */
export const QUEUES = {
  /** Runs evaluation datasets against the assistant. */
  evaluations: 'evaluations',
  /** Checks sampled live answers against their sources (hallucination monitoring). */
  answerReviews: 'answer-reviews',
  /** Scheduled housekeeping, such as expiring overdue approval requests. */
  maintenance: 'maintenance',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
