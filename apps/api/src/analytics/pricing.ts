/** Model list prices in USD per million tokens, for cost estimates only. */
export interface ModelPrice {
  input: number;
  output: number;
}

/**
 * List prices as published when this was written. Override or extend them with the
 * AI_MODEL_PRICES environment variable when providers change their rates.
 */
export const DEFAULT_MODEL_PRICES: Record<string, ModelPrice> = {
  'gpt-6.1-sol': { input: 2, output: 10 },
  'deepseek-flash': { input: 0.3, output: 1.2 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
};

export function parsePriceOverrides(raw: string): Record<string, ModelPrice> {
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw) as Record<string, Partial<ModelPrice>>;
  const out: Record<string, ModelPrice> = {};
  for (const [model, price] of Object.entries(parsed)) {
    if (typeof price?.input !== 'number' || typeof price?.output !== 'number') {
      throw new Error(`AI_MODEL_PRICES: "${model}" needs numeric "input" and "output" prices`);
    }
    out[model] = { input: price.input, output: price.output };
  }
  return out;
}

export class PriceList {
  private readonly entries: [string, ModelPrice][];

  constructor(prices: Record<string, ModelPrice>) {
    // Longest name first, so a dated snapshot like "gpt-6.1-sol-2026-09-30" matches its family.
    this.entries = Object.entries(prices).sort((a, b) => b[0].length - a[0].length);
  }

  find(model: string): ModelPrice | null {
    const name = model.toLowerCase();
    return this.entries.find(([key]) => name === key || name.startsWith(`${key}-`))?.[1] ?? null;
  }

  /** Estimated cost in USD, or null when the model has no known price. */
  cost(model: string, inputTokens: number, outputTokens: number): number | null {
    const price = this.find(model);
    if (!price) return null;
    return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  }
}
