import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gateEnforce } from '../src/tools/gate_enforce.js';
import { loadMetricsFromArtifacts, loadMetricsFromTools, defaultPaths } from '../src/gate/sources.js';
import type { GateEnforceInput } from '../src/tools/gate_enforce.js';
import type { GateMetrics, GateResult } from '../src/gate/types.js';

vi.mock('../src/gate/sources.js', () => {
  const defaults = {
    tests: '.qreport/tests.json',
    coverage: '.qreport/coverage.json',
    lint: '.qreport/lint.json',
    complexity: '.qreport/complexity.json'
  };

  return {
    loadMetricsFromArtifacts: vi.fn(),
    loadMetricsFromTools: vi.fn(),
    defaultPaths: vi.fn(() => ({ ...defaults }))
  };
});

const artifactsMock = vi.mocked(loadMetricsFromArtifacts);
const toolsMock = vi.mocked(loadMetricsFromTools);
const defaultPathsMock = vi.mocked(defaultPaths);

const makeMetrics = (overrides: Partial<GateMetrics> = {}): GateMetrics => ({
  tests: { total: 24, failed: 0, ...(overrides.tests ?? {}) },
  coverage: { lines: 0.86, ...(overrides.coverage ?? {}) },
  lint: { errors: 0, warnings: 1, ...(overrides.lint ?? {}) },
  complexity: { avgCyclomatic: 3.2, maxCyclomatic: 7.4, ...(overrides.complexity ?? {}) }
});

const baseResult = (): GateResult => ({
  passed: true,
  metrics: makeMetrics(),
  violations: []
});

const restoreEnv = () => {
  delete process.env.QUALITY_GATE_RGR_COUNT;
  delete process.env.QUALITY_GATE_TASK_DB;
};

describe('quality.gate_enforce tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    artifactsMock.mockReset();
    toolsMock.mockReset();
    defaultPathsMock.mockClear();
    restoreEnv();
  });

  it('passes when metrics meet default thresholds', async () => {
    artifactsMock.mockResolvedValueOnce(makeMetrics());

    const input: GateEnforceInput = {
      task: { id: 'TR-01', scope: 'minor' },
      source: 'artifacts'
    };

    const result = await gateEnforce(input, { rgrLogCount: 3 });

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.metrics).toEqual(makeMetrics());
    expect(artifactsMock).toHaveBeenCalledTimes(1);
  });

  it('collects violations when metrics breach policy', async () => {
    artifactsMock.mockResolvedValueOnce(
      makeMetrics({
        tests: { total: 12, failed: 2 },
        coverage: { lines: 0.63 },
        lint: { errors: 1, warnings: 4 },
        complexity: { avgCyclomatic: 6.1, maxCyclomatic: 13.5 }
      })
    );

    const input: GateEnforceInput = {
      task: { id: 'TR-02', scope: 'major' },
      source: 'artifacts',
      thresholds: { allowWarnings: false }
    };

    const result = await gateEnforce(input, { rgrLogCount: 1 });

    expect(result.passed).toBe(false);
    expect(result.violations.map((violation) => violation.code)).toEqual(
      expect.arrayContaining(['TESTS_FAILED', 'COVERAGE_BELOW', 'LINT_ERRORS', 'COMPLEXITY_HIGH', 'RGR_MISSING'])
    );
  });

  it('resolves metrics from tools when requested', async () => {
    toolsMock.mockResolvedValueOnce(makeMetrics());

    const input: GateEnforceInput = {
      task: { id: 'TR-03', scope: 'major' },
      source: 'tools'
    };

    const loadRgrLogCount = vi.fn().mockResolvedValue(4);

    const result = await gateEnforce(input, { loadRgrLogCount });

    expect(result).toEqual(baseResult());
    expect(toolsMock).toHaveBeenCalledTimes(1);
    expect(loadRgrLogCount).toHaveBeenCalledWith('TR-03');
  });

  it('merges custom artifact paths before loading metrics', async () => {
    const metrics = makeMetrics();
    artifactsMock.mockResolvedValueOnce(metrics);

    const input: GateEnforceInput = {
      task: { id: 'TR-04', scope: 'minor' },
      source: 'artifacts',
      paths: { tests: 'custom/tests.json', lint: 'custom/lint.json' }
    };

    await gateEnforce(input, { rgrLogCount: 2 });

    expect(defaultPathsMock).toHaveBeenCalled();
    expect(artifactsMock).toHaveBeenCalledWith({
      tests: 'custom/tests.json',
      coverage: '.qreport/coverage.json',
      lint: 'custom/lint.json',
      complexity: '.qreport/complexity.json'
    });
  });

  it('uses environment variable fallback for RGR log count', async () => {
    artifactsMock.mockResolvedValueOnce(makeMetrics());
    process.env.QUALITY_GATE_RGR_COUNT = '1';

    const input: GateEnforceInput = {
      task: { id: 'TR-05', scope: 'minor' },
      source: 'artifacts'
    };

    const result = await gateEnforce(input);

    expect(result.passed).toBe(false);
    expect(result.violations.map((violation) => violation.code)).toContain('RGR_MISSING');
  });

  it('rejects invalid input payloads', async () => {
    await expect(gateEnforce({} as any)).rejects.toThrow(/Invalid input/);
  });
});
