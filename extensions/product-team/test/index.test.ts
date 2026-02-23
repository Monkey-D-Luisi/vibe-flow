import { describe, it, expect } from 'vitest';
import { register } from '../src/index.js';

describe('product-team plugin', () => {
  it('exports a register function', () => {
    expect(typeof register).toBe('function');
  });

  it('register runs without error with a mock API', () => {
    const mockApi = {
      registerTool: () => {},
    };
    expect(() => register(mockApi)).not.toThrow();
  });
});
