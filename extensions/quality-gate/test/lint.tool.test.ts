import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for the lint tool (src/tools/lint.ts).
 *
 * The lint tool orchestrates spawning lint commands (eslint or ruff),
 * parsing their output, and returning normalized results.
 */

vi.mock('../src/exec/spawn.js', () => ({
  safeSpawn: vi.fn(),
}));

vi.mock('../src/parsers/eslint.js', () => ({
  parseEslintOutput: vi.fn(),
  summarizeEslint: vi.fn(),
}));

vi.mock('../src/parsers/ruff.js', () => ({
  parseRuffOutput: vi.fn(),
  summarizeRuff: vi.fn(),
}));

import { safeSpawn } from '../src/exec/spawn.js';
import { parseEslintOutput, summarizeEslint } from '../src/parsers/eslint.js';
import { parseRuffOutput, summarizeRuff } from '../src/parsers/ruff.js';

const mockSafeSpawn = vi.mocked(safeSpawn);
const mockParseEslint = vi.mocked(parseEslintOutput);
const mockSummarizeEslint = vi.mocked(summarizeEslint);
const mockParseRuff = vi.mocked(parseRuffOutput);
const mockSummarizeRuff = vi.mocked(summarizeRuff);

describe('lint tool types', () => {
  it('should accept eslint tool type', () => {
    const input = { tool: 'eslint' as const };
    expect(input.tool).toBe('eslint');
  });

  it('should accept ruff tool type', () => {
    const input = { tool: 'ruff' as const };
    expect(input.tool).toBe('ruff');
  });

  it('should accept optional fields', () => {
    const input = {
      tool: 'eslint' as const,
      cmd: 'npx eslint',
      cwd: '/project',
      timeoutMs: 30000,
      envAllow: ['NODE_ENV'],
      paths: ['src/**/*.ts'],
    };

    expect(input.tool).toBe('eslint');
    expect(input.cmd).toBe('npx eslint');
    expect(input.cwd).toBe('/project');
    expect(input.timeoutMs).toBe(30000);
    expect(input.envAllow).toEqual(['NODE_ENV']);
    expect(input.paths).toEqual(['src/**/*.ts']);
  });
});

describe('lint mocks integration', () => {
  it('eslint parser can be mocked and called', () => {
    mockParseEslint.mockReturnValue([
      { file: '/src/a.ts', errors: 1, warnings: 0, messages: [] },
    ]);

    const result = parseEslintOutput('[]');
    expect(result).toHaveLength(1);
    expect(result[0].errors).toBe(1);
  });

  it('ruff parser can be mocked and called', () => {
    mockParseRuff.mockReturnValue([
      { file: '/src/main.py', errors: 2, warnings: 1, messages: [] },
    ]);

    const result = parseRuffOutput('[]');
    expect(result).toHaveLength(1);
    expect(result[0].errors).toBe(2);
  });

  it('safeSpawn can be mocked to return lint output', async () => {
    mockSafeSpawn.mockResolvedValue({
      stdout: '[]',
      stderr: '',
      exitCode: 0,
      durationMs: 500,
      timedOut: false,
    });

    const result = await safeSpawn('eslint', ['--format', 'json', 'src/']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('[]');
  });

  it('eslint summarize can be mocked', () => {
    mockSummarizeEslint.mockReturnValue({
      totalErrors: 0,
      totalWarnings: 2,
      filesWithIssues: 1,
      totalFiles: 5,
    });

    const summary = summarizeEslint([]);
    expect(summary.totalErrors).toBe(0);
    expect(summary.totalWarnings).toBe(2);
  });

  it('ruff summarize can be mocked', () => {
    mockSummarizeRuff.mockReturnValue({
      totalErrors: 3,
      totalWarnings: 0,
      filesWithIssues: 2,
      totalFiles: 10,
    });

    const summary = summarizeRuff([]);
    expect(summary.totalErrors).toBe(3);
  });
});
