import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for input validation in quality-gate tool execute handlers.
 *
 * Each tool's execute handler must validate Record<string, unknown> inputs
 * and throw with INVALID_INPUT prefix on type mismatches.
 */

vi.mock('@openclaw/quality-contracts/fs/glob', () => ({
  resolveGlobPatterns: vi.fn().mockResolvedValue([]),
}));

vi.mock('@openclaw/quality-contracts/fs/read', () => ({
  readFileSafe: vi.fn().mockResolvedValue(''),
}));

vi.mock('../src/gate/sources.js', () => ({
  collectGateMetrics: vi.fn().mockResolvedValue({}),
}));

vi.mock('../src/parsers/istanbul.js', () => ({
  parseCoverageSummary: vi.fn(),
  parseLcov: vi.fn().mockReturnValue([]),
  computeLcovSummary: vi.fn(),
}));

import { complexityToolDef } from '../src/tools/complexity.js';
import { gateEnforceToolDef } from '../src/tools/gate_enforce.js';
import { coverageReportToolDef } from '../src/tools/coverage_report.js';

describe('complexity tool input validation', () => {
  it('throws INVALID_INPUT when globs is not an array', async () => {
    await expect(complexityToolDef.execute('id', { globs: 'not-an-array' }))
      .rejects
      .toThrow('INVALID_INPUT');
  });

  it('throws INVALID_INPUT when cwd is not a string', async () => {
    await expect(complexityToolDef.execute('id', { cwd: 42 }))
      .rejects
      .toThrow('INVALID_INPUT');
  });

  it('throws INVALID_INPUT when maxCyclomatic is not a number', async () => {
    await expect(complexityToolDef.execute('id', { maxCyclomatic: 'ten' }))
      .rejects
      .toThrow('INVALID_INPUT');
  });

  it('throws INVALID_INPUT when maxCyclomatic is NaN', async () => {
    await expect(complexityToolDef.execute('id', { maxCyclomatic: NaN }))
      .rejects
      .toThrow('INVALID_INPUT');
  });

  it('throws INVALID_INPUT when maxCyclomatic is Infinity', async () => {
    await expect(complexityToolDef.execute('id', { maxCyclomatic: Infinity }))
      .rejects
      .toThrow('INVALID_INPUT');
  });

  it('accepts valid optional inputs without throwing', async () => {
    await expect(complexityToolDef.execute('id', {})).resolves.toBeDefined();
  });
});

describe('gate_enforce tool input validation', () => {
  it('throws INVALID_INPUT when scope is not a valid enum value', async () => {
    await expect(gateEnforceToolDef.execute('id', { scope: 'invalid-scope' }))
      .rejects
      .toThrow('INVALID_INPUT');
  });

  it('throws INVALID_INPUT when policy is not an object', async () => {
    await expect(gateEnforceToolDef.execute('id', { policy: 'not-an-object' }))
      .rejects
      .toThrow('INVALID_INPUT');
  });

  it('throws INVALID_INPUT when metrics is an array', async () => {
    await expect(gateEnforceToolDef.execute('id', { metrics: [1, 2, 3] }))
      .rejects
      .toThrow('INVALID_INPUT');
  });

  it('throws INVALID_INPUT when history is not an array', async () => {
    await expect(gateEnforceToolDef.execute('id', { history: 'not-an-array' }))
      .rejects
      .toThrow('INVALID_INPUT');
  });

  it('throws INVALID_INPUT when deps is not an object', async () => {
    await expect(gateEnforceToolDef.execute('id', { deps: 'not-an-object' }))
      .rejects
      .toThrow('INVALID_INPUT');
  });

  it('throws INVALID_INPUT when autoTune is an array', async () => {
    await expect(gateEnforceToolDef.execute('id', { autoTune: [] }))
      .rejects
      .toThrow('INVALID_INPUT');
  });

  it('throws INVALID_INPUT when alerts is not an object', async () => {
    await expect(gateEnforceToolDef.execute('id', { alerts: 42 }))
      .rejects
      .toThrow('INVALID_INPUT');
  });

  it('accepts valid scope enum values without throwing', async () => {
    for (const scope of ['major', 'minor', 'patch', 'default']) {
      await expect(gateEnforceToolDef.execute('id', { scope })).resolves.toBeDefined();
    }
  });
});

describe('coverage_report tool input validation', () => {
  it('throws INVALID_INPUT when summaryPath is not a string', async () => {
    await expect(coverageReportToolDef.execute('id', { summaryPath: 123 }))
      .rejects
      .toThrow('INVALID_INPUT');
  });

  it('throws INVALID_INPUT when cwd is not a string', async () => {
    await expect(coverageReportToolDef.execute('id', { cwd: true }))
      .rejects
      .toThrow('INVALID_INPUT');
  });

  it('throws INVALID_INPUT when format is not a valid enum value', async () => {
    await expect(coverageReportToolDef.execute('id', { format: 'xml' }))
      .rejects
      .toThrow('INVALID_INPUT');
  });

  it('does not throw an input validation error for valid format enum values', async () => {
    for (const format of ['summary', 'lcov', 'auto']) {
      await expect(coverageReportToolDef.execute('id', { format }))
        .rejects
        .toThrow('NOT_FOUND');
    }
  });
});
