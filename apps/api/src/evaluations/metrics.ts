import { EVAL_PASS_SCORE, type EvalMetrics } from '@groundline/shared';

export interface ScoredCase {
  expectInsufficient: boolean;
  answerStatus: string;
  relevance: number | null;
  groundedness: number | null;
  correctness: number | null;
  retrievalHit: boolean | null;
  reciprocalRank: number | null;
  latencyMs: number;
  error: string | null;
}

/**
 * Whether a case passed. Declines pass only when the assistant declined. Answers pass when
 * they're relevant, grounded in the sources, agree with the expected answer (if one was
 * given) and the expected source was retrieved (if any were given).
 */
export function casePassed(c: ScoredCase): boolean {
  if (c.error) return false;
  if (c.expectInsufficient) return c.answerStatus === 'INSUFFICIENT_CONTEXT';
  if (c.answerStatus !== 'ANSWERED') return false;
  const ok = (v: number | null) => v !== null && v >= EVAL_PASS_SCORE;
  return ok(c.relevance) && ok(c.groundedness) && (c.correctness === null || ok(c.correctness)) && c.retrievalHit !== false;
}

const avg = (values: number[]): number | null =>
  values.length ? Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(3)) : null;
const rate = (hits: number, total: number): number | null => (total ? Number((hits / total).toFixed(3)) : null);

export function computeMetrics(cases: (ScoredCase & { passed: boolean })[]): EvalMetrics {
  const scored = cases.filter((c) => !c.error);
  const answered = scored.filter((c) => c.answerStatus === 'ANSWERED');
  const graded = answered.filter((c) => c.groundedness !== null);
  const withSources = scored.filter((c) => c.retrievalHit !== null);
  const declines = scored.filter((c) => c.expectInsufficient);
  return {
    passRate: rate(cases.filter((c) => c.passed).length, cases.length),
    avgRelevance: avg(graded.flatMap((c) => (c.relevance === null ? [] : [c.relevance]))),
    avgGroundedness: avg(graded.flatMap((c) => (c.groundedness === null ? [] : [c.groundedness]))),
    avgCorrectness: avg(graded.flatMap((c) => (c.correctness === null ? [] : [c.correctness]))),
    hallucinationRate: rate(graded.filter((c) => c.groundedness! < EVAL_PASS_SCORE).length, graded.length),
    retrievalHitRate: rate(withSources.filter((c) => c.retrievalHit).length, withSources.length),
    meanReciprocalRank: avg(withSources.map((c) => c.reciprocalRank ?? 0)),
    declineAccuracy: rate(declines.filter((c) => c.answerStatus === 'INSUFFICIENT_CONTEXT').length, declines.length),
    answered: answered.length,
    insufficient: scored.filter((c) => c.answerStatus === 'INSUFFICIENT_CONTEXT').length,
    errors: cases.length - scored.length,
    avgLatencyMs: avg(scored.map((c) => c.latencyMs)) === null ? null : Math.round(avg(scored.map((c) => c.latencyMs))!),
  };
}
