/**
 * Provider pricing table for USD cost calculation.
 *
 * Maps (provider, model) pairs to per-1K-token rates for input and output.
 * Used by the agent budget tracker to convert token counts to USD costs.
 */

export interface ModelPricing {
  readonly provider: string;
  readonly model: string;
  readonly inputPer1KTokens: number;
  readonly outputPer1KTokens: number;
}

/**
 * Default pricing table. Copilot-proxy is free-tier.
 * Rates are approximate and configurable via plugin config.
 */
const DEFAULT_PRICING: readonly ModelPricing[] = [
  { provider: 'anthropic', model: 'claude-opus-4.6', inputPer1KTokens: 0.015, outputPer1KTokens: 0.075 },
  { provider: 'anthropic', model: 'claude-sonnet-4.6', inputPer1KTokens: 0.003, outputPer1KTokens: 0.015 },
  { provider: 'openai', model: 'gpt-5.3', inputPer1KTokens: 0.010, outputPer1KTokens: 0.030 },
  { provider: 'openai', model: 'gpt-4.1', inputPer1KTokens: 0.002, outputPer1KTokens: 0.008 },
  { provider: 'github', model: 'copilot-proxy', inputPer1KTokens: 0, outputPer1KTokens: 0 },
];

/**
 * Default budget allocation percentages per agent role.
 * Values sum to 1.0 and represent the share of pipeline budget.
 */
export const DEFAULT_AGENT_ALLOCATIONS: Readonly<Record<string, number>> = {
  pm: 0.05,
  po: 0.10,
  'tech-lead': 0.15,
  designer: 0.05,
  'back-1': 0.25,
  'front-1': 0.20,
  qa: 0.10,
  devops: 0.10,
};

export class PricingTable {
  private readonly lookup: ReadonlyMap<string, ModelPricing>;

  constructor(overrides?: readonly ModelPricing[]) {
    const entries = overrides ?? DEFAULT_PRICING;
    const map = new Map<string, ModelPricing>();
    for (const entry of entries) {
      map.set(pricingKey(entry.provider, entry.model), entry);
    }
    this.lookup = map;
  }

  /**
   * Find pricing for a given provider+model pair.
   * Returns null if no pricing is configured (treated as free).
   */
  getPrice(provider: string, model: string): ModelPricing | null {
    return this.lookup.get(pricingKey(provider, model)) ?? null;
  }

  /**
   * Calculate USD cost for a given token usage.
   * Returns 0 if no pricing found (fail-open: unknown models are free).
   */
  calculateUsd(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): number {
    const pricing = this.getPrice(provider, model);
    if (!pricing) return 0;
    const inputCost = (inputTokens / 1000) * pricing.inputPer1KTokens;
    const outputCost = (outputTokens / 1000) * pricing.outputPer1KTokens;
    return inputCost + outputCost;
  }

  /**
   * List all configured pricing entries.
   */
  listAll(): readonly ModelPricing[] {
    return [...this.lookup.values()];
  }
}

function pricingKey(provider: string, model: string): string {
  return `${provider}::${model}`;
}

/**
 * Parse pricing table overrides from plugin config.
 * Expected format: Array<{ provider, model, inputPer1KTokens, outputPer1KTokens }>
 */
export function parsePricingConfig(
  raw: unknown,
): ModelPricing[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const result: ModelPricing[] = [];
  for (const item of raw) {
    if (
      typeof item === 'object' &&
      item !== null &&
      typeof item.provider === 'string' &&
      typeof item.model === 'string' &&
      typeof item.inputPer1KTokens === 'number' &&
      Number.isFinite(item.inputPer1KTokens) &&
      item.inputPer1KTokens >= 0 &&
      typeof item.outputPer1KTokens === 'number' &&
      Number.isFinite(item.outputPer1KTokens) &&
      item.outputPer1KTokens >= 0
    ) {
      result.push({
        provider: item.provider as string,
        model: item.model as string,
        inputPer1KTokens: item.inputPer1KTokens as number,
        outputPer1KTokens: item.outputPer1KTokens as number,
      });
    }
  }

  return result.length > 0 ? result : undefined;
}

/**
 * Parse agent allocation overrides from plugin config.
 * Expected format: Record<string, number> where values are 0-1 fractions.
 */
export function parseAllocationConfig(
  raw: unknown,
): Record<string, number> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;

  const obj = raw as Record<string, unknown>;
  const result: Record<string, number> = {};
  let found = false;

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'number' && value >= 0 && value <= 1) {
      result[key] = value;
      found = true;
    }
  }

  return found ? result : undefined;
}
