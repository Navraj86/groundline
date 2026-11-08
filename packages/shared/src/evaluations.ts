import { z } from 'zod';
import type { UserRef } from './types.js';

/** Most test questions a dataset may hold; each run answers all of them. */
export const EVAL_MAX_CASES = 100;
/** Score (0–1) an answer needs on each criterion to pass. */
export const EVAL_PASS_SCORE = 0.6;

export const EVAL_RUN_STATUSES = ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type EvalRunStatus = (typeof EVAL_RUN_STATUSES)[number];

/** Built-in datasets an organization can start from (FR-063). */
export const EVAL_TEMPLATES = {
  guardrails: {
    name: 'Guardrails',
    description: 'Questions the assistant should decline: off-topic requests, other people’s data, and attempts to override its instructions.',
  },
} as const;
export type EvalTemplate = keyof typeof EVAL_TEMPLATES;

export const createEvalDatasetSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
});
export type CreateEvalDatasetInput = z.infer<typeof createEvalDatasetSchema>;

export const createFromTemplateSchema = z.object({
  template: z.enum(Object.keys(EVAL_TEMPLATES) as [EvalTemplate, ...EvalTemplate[]]),
});
export type CreateFromTemplateInput = z.infer<typeof createFromTemplateSchema>;

export const updateEvalDatasetSchema = createEvalDatasetSchema.partial();
export type UpdateEvalDatasetInput = z.infer<typeof updateEvalDatasetSchema>;

export const evalCaseSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  expectedAnswer: z.string().trim().max(2000).nullish(),
  expectedSourceIds: z.array(z.uuid()).max(10).default([]),
  expectInsufficient: z.boolean().default(false),
});
export type EvalCaseInput = z.infer<typeof evalCaseSchema>;

export const importEvalCasesSchema = z.object({
  cases: z.array(evalCaseSchema).min(1).max(EVAL_MAX_CASES),
});
export type ImportEvalCasesInput = z.infer<typeof importEvalCasesSchema>;

export interface EvalCaseView {
  id: string;
  question: string;
  expectedAnswer: string | null;
  expectedSources: { id: string; title: string }[];
  expectInsufficient: boolean;
  createdAt: string;
}

/** Aggregate scores for a run. Averages are 0–1 and null when nothing qualified. */
export interface EvalMetrics {
  passRate: number | null;
  avgRelevance: number | null;
  avgGroundedness: number | null;
  avgCorrectness: number | null;
  /** Answered cases whose groundedness fell below the pass score. */
  hallucinationRate: number | null;
  /** Cases with expected sources where one of them was retrieved. */
  retrievalHitRate: number | null;
  /** Mean reciprocal rank of the first expected source. */
  meanReciprocalRank: number | null;
  /** Cases expected to be declined that were. */
  declineAccuracy: number | null;
  answered: number;
  insufficient: number;
  errors: number;
  avgLatencyMs: number | null;
}

export interface EvalRunSummary {
  id: string;
  datasetId: string;
  datasetName: string;
  status: EvalRunStatus;
  totalCases: number;
  completedCases: number;
  passedCases: number;
  metrics: EvalMetrics | null;
  promptVersion: string | null;
  provider: string | null;
  model: string | null;
  judge: string | null;
  inputTokens: number;
  outputTokens: number;
  error: string | null;
  createdBy: UserRef | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface EvalResultView {
  id: string;
  caseId: string | null;
  question: string;
  expectedAnswer: string | null;
  expectInsufficient: boolean;
  answer: string;
  answerStatus: string;
  passed: boolean;
  relevance: number | null;
  groundedness: number | null;
  correctness: number | null;
  retrievalHit: boolean | null;
  reciprocalRank: number | null;
  unsupportedClaims: string[];
  judgeNotes: string | null;
  latencyMs: number;
  error: string | null;
}

export interface EvalRunDetail extends EvalRunSummary {
  results: EvalResultView[];
}

export interface EvalDatasetSummary {
  id: string;
  name: string;
  description: string | null;
  caseCount: number;
  lastRun: EvalRunSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvalDatasetDetail extends EvalDatasetSummary {
  cases: EvalCaseView[];
}
