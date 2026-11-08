import { casePassed, computeMetrics, type ScoredCase } from './metrics.js';

const answered = (over: Partial<ScoredCase> = {}): ScoredCase => ({
  expectInsufficient: false,
  answerStatus: 'ANSWERED',
  relevance: 1,
  groundedness: 1,
  correctness: null,
  retrievalHit: null,
  reciprocalRank: null,
  latencyMs: 1000,
  error: null,
  ...over,
});

describe('casePassed', () => {
  it('passes relevant, grounded answers', () => {
    expect(casePassed(answered())).toBe(true);
  });

  it('fails answers with unsupported claims, wrong facts or the wrong source', () => {
    expect(casePassed(answered({ groundedness: 0.5 }))).toBe(false);
    expect(casePassed(answered({ correctness: 0.25 }))).toBe(false);
    expect(casePassed(answered({ retrievalHit: false, reciprocalRank: 0 }))).toBe(false);
  });

  it('expects declines to decline, and only declines', () => {
    expect(casePassed(answered({ expectInsufficient: true }))).toBe(false);
    expect(casePassed({ ...answered(), expectInsufficient: true, answerStatus: 'INSUFFICIENT_CONTEXT', relevance: null, groundedness: null })).toBe(true);
    expect(casePassed({ ...answered(), answerStatus: 'INSUFFICIENT_CONTEXT', relevance: null, groundedness: null })).toBe(false);
  });

  it('fails cases that errored', () => {
    expect(casePassed(answered({ error: 'AI service responded 500' }))).toBe(false);
  });
});

describe('computeMetrics', () => {
  it('aggregates scores, retrieval and decline accuracy', () => {
    const cases = [
      answered({ correctness: 1, retrievalHit: true, reciprocalRank: 1, latencyMs: 1000 }),
      answered({ groundedness: 0.25, retrievalHit: true, reciprocalRank: 0.5, latencyMs: 3000 }),
      { ...answered(), expectInsufficient: true, answerStatus: 'INSUFFICIENT_CONTEXT', relevance: null, groundedness: null, latencyMs: 20 },
      answered({ error: 'timeout', answerStatus: 'ERROR', relevance: null, groundedness: null }),
    ].map((c) => ({ ...c, passed: casePassed(c) }));

    expect(computeMetrics(cases)).toEqual({
      passRate: 0.5,
      avgRelevance: 1,
      avgGroundedness: 0.625,
      avgCorrectness: 1,
      hallucinationRate: 0.5,
      retrievalHitRate: 1,
      meanReciprocalRank: 0.75,
      declineAccuracy: 1,
      answered: 2,
      insufficient: 1,
      errors: 1,
      avgLatencyMs: 1340,
    });
  });

  it('reports nulls rather than zeros when nothing qualifies', () => {
    const m = computeMetrics([]);
    expect(m.passRate).toBeNull();
    expect(m.retrievalHitRate).toBeNull();
    expect(m.avgLatencyMs).toBeNull();
  });
});
