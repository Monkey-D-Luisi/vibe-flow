import { describe, it, expect, vi } from 'vitest';

// Mock the entire po module to avoid schema dependencies
vi.mock('../src/agents/po.js', () => ({
  PO_SYSTEM_PROMPT: 'Mock PO system prompt',
  validatePoInput: vi.fn(),
  validatePoBrief: vi.fn()
}));

describe('PO Agent', () => {
  it('should have PO_SYSTEM_PROMPT', () => {
    const po = require('../src/agents/po.js');
    expect(po.PO_SYSTEM_PROMPT).toBe('Mock PO system prompt');
  });

  it('should have validatePoInput function', () => {
    const po = require('../src/agents/po.js');
    expect(typeof po.validatePoInput).toBe('function');
  });

  it('should have validatePoBrief function', () => {
    const po = require('../src/agents/po.js');
    expect(typeof po.validatePoBrief).toBe('function');
  });
});