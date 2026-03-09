import { describe, it, expect } from 'vitest';
import {
  PricingTable,
  DEFAULT_AGENT_ALLOCATIONS,
  parsePricingConfig,
  parseAllocationConfig,
} from '../../src/domain/pricing-table.js';
import type { ModelPricing } from '../../src/domain/pricing-table.js';

describe('PricingTable', () => {
  describe('default pricing', () => {
    const table = new PricingTable();

    it('returns pricing for anthropic claude-opus-4.6', () => {
      const price = table.getPrice('anthropic', 'claude-opus-4.6');
      expect(price).not.toBeNull();
      expect(price!.inputPer1KTokens).toBe(0.015);
      expect(price!.outputPer1KTokens).toBe(0.075);
    });

    it('returns pricing for anthropic claude-sonnet-4.6', () => {
      const price = table.getPrice('anthropic', 'claude-sonnet-4.6');
      expect(price).not.toBeNull();
      expect(price!.inputPer1KTokens).toBe(0.003);
      expect(price!.outputPer1KTokens).toBe(0.015);
    });

    it('returns zero pricing for copilot-proxy', () => {
      const price = table.getPrice('github', 'copilot-proxy');
      expect(price).not.toBeNull();
      expect(price!.inputPer1KTokens).toBe(0);
      expect(price!.outputPer1KTokens).toBe(0);
    });

    it('returns null for unknown model', () => {
      expect(table.getPrice('unknown', 'unknown-model')).toBeNull();
    });

    it('lists all default entries', () => {
      const all = table.listAll();
      expect(all.length).toBe(5);
    });
  });

  describe('custom pricing', () => {
    const custom: ModelPricing[] = [
      { provider: 'custom', model: 'fast', inputPer1KTokens: 0.001, outputPer1KTokens: 0.002 },
    ];
    const table = new PricingTable(custom);

    it('uses custom pricing when provided', () => {
      const price = table.getPrice('custom', 'fast');
      expect(price).not.toBeNull();
      expect(price!.inputPer1KTokens).toBe(0.001);
    });

    it('does not have default pricing', () => {
      expect(table.getPrice('anthropic', 'claude-opus-4.6')).toBeNull();
    });
  });

  describe('calculateUsd', () => {
    const table = new PricingTable();

    it('calculates cost for known model', () => {
      // claude-opus-4.6: $0.015/1K input, $0.075/1K output
      const usd = table.calculateUsd('anthropic', 'claude-opus-4.6', 1000, 500);
      // 1000/1000 * 0.015 = 0.015
      // 500/1000 * 0.075 = 0.0375
      expect(usd).toBeCloseTo(0.0525, 6);
    });

    it('returns 0 for unknown model', () => {
      expect(table.calculateUsd('unknown', 'unknown', 1000, 500)).toBe(0);
    });

    it('returns 0 for copilot-proxy', () => {
      expect(table.calculateUsd('github', 'copilot-proxy', 10000, 5000)).toBe(0);
    });

    it('handles zero tokens', () => {
      expect(table.calculateUsd('anthropic', 'claude-opus-4.6', 0, 0)).toBe(0);
    });
  });
});

describe('DEFAULT_AGENT_ALLOCATIONS', () => {
  it('has 8 default agents', () => {
    expect(Object.keys(DEFAULT_AGENT_ALLOCATIONS).length).toBe(8);
  });

  it('allocations sum to 1.0', () => {
    const sum = Object.values(DEFAULT_AGENT_ALLOCATIONS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it('has expected agent ids', () => {
    expect(DEFAULT_AGENT_ALLOCATIONS).toHaveProperty('pm');
    expect(DEFAULT_AGENT_ALLOCATIONS).toHaveProperty('po');
    expect(DEFAULT_AGENT_ALLOCATIONS).toHaveProperty('tech-lead');
    expect(DEFAULT_AGENT_ALLOCATIONS).toHaveProperty('designer');
    expect(DEFAULT_AGENT_ALLOCATIONS).toHaveProperty('back-1');
    expect(DEFAULT_AGENT_ALLOCATIONS).toHaveProperty('front-1');
    expect(DEFAULT_AGENT_ALLOCATIONS).toHaveProperty('qa');
    expect(DEFAULT_AGENT_ALLOCATIONS).toHaveProperty('devops');
  });
});

describe('parsePricingConfig', () => {
  it('returns undefined for non-array input', () => {
    expect(parsePricingConfig('not-array')).toBeUndefined();
    expect(parsePricingConfig(null)).toBeUndefined();
    expect(parsePricingConfig(42)).toBeUndefined();
  });

  it('returns undefined for empty array', () => {
    expect(parsePricingConfig([])).toBeUndefined();
  });

  it('parses valid pricing entries', () => {
    const result = parsePricingConfig([
      { provider: 'test', model: 'm1', inputPer1KTokens: 0.01, outputPer1KTokens: 0.02 },
    ]);
    expect(result).toHaveLength(1);
    expect(result![0].provider).toBe('test');
  });

  it('skips invalid entries', () => {
    const result = parsePricingConfig([
      { provider: 'test', model: 'm1', inputPer1KTokens: 0.01, outputPer1KTokens: 0.02 },
      { provider: 123, model: 'm2' }, // invalid
      { missing: 'fields' }, // invalid
    ]);
    expect(result).toHaveLength(1);
  });
});

describe('parseAllocationConfig', () => {
  it('returns undefined for non-object input', () => {
    expect(parseAllocationConfig('not-object')).toBeUndefined();
    expect(parseAllocationConfig(null)).toBeUndefined();
    expect(parseAllocationConfig([])).toBeUndefined();
  });

  it('parses valid allocations', () => {
    const result = parseAllocationConfig({ pm: 0.1, po: 0.2 });
    expect(result).toEqual({ pm: 0.1, po: 0.2 });
  });

  it('skips invalid values', () => {
    const result = parseAllocationConfig({ pm: 0.1, invalid: -1, tooHigh: 2, notNumber: 'str' });
    expect(result).toEqual({ pm: 0.1 });
  });

  it('returns undefined when all values are invalid', () => {
    expect(parseAllocationConfig({ bad: -1 })).toBeUndefined();
  });
});
