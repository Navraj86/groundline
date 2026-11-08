import { DEFAULT_MODEL_PRICES, parsePriceOverrides, PriceList } from './pricing.js';

describe('PriceList', () => {
  const prices = new PriceList({ ...DEFAULT_MODEL_PRICES, 'gpt-6.1-sol-mini': { input: 0.5, output: 2 } });

  it('prices exact model names per million tokens', () => {
    expect(prices.cost('gpt-6.1-sol', 1_000_000, 100_000)).toBeCloseTo(3);
  });

  it('matches dated snapshots to their family, preferring the longest name', () => {
    expect(prices.find('gpt-6.1-sol-2026-09-30')).toEqual({ input: 2, output: 10 });
    expect(prices.find('gpt-6.1-sol-mini-2026-10-01')).toEqual({ input: 0.5, output: 2 });
  });

  it('returns null for unknown models instead of guessing', () => {
    expect(prices.cost('some-new-model', 1000, 1000)).toBeNull();
  });
});

describe('parsePriceOverrides', () => {
  it('reads JSON overrides', () => {
    expect(parsePriceOverrides('{"my-model": {"input": 1, "output": 4}}')).toEqual({ 'my-model': { input: 1, output: 4 } });
    expect(parsePriceOverrides('')).toEqual({});
  });

  it('rejects incomplete entries', () => {
    expect(() => parsePriceOverrides('{"my-model": {"input": 1}}')).toThrow(/numeric/);
  });
});
