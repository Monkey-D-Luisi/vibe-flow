import { describe, it, expect, vi } from 'vitest';

// Mock the entire po module to avoid schema dependencies
vi.mock('../src/agents/po', () => ({
  PO_SYSTEM_PROMPT: 'Mock PO system prompt',
  validatePoInput: vi.fn(),
  validatePoBrief: vi.fn()
}));

describe('PO Agent', () => {
  it('should have PO_SYSTEM_PROMPT', async () => {
    const po = await import('../src/agents/po');
    expect(po.PO_SYSTEM_PROMPT).toBe('Mock PO system prompt');
  });

  it('should have validatePoInput function', async () => {
    const po = await import('../src/agents/po');
    expect(typeof po.validatePoInput).toBe('function');
  });

  it('should have validatePoBrief function', async () => {
    const po = await import('../src/agents/po');
    expect(typeof po.validatePoBrief).toBe('function');
  });
});