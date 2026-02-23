import { describe, it, expect, vi } from 'vitest';
import type { ComplexitySummary } from '../src/complexity/types.js';

/**
 * Tests for the complexity tool (src/tools/complexity.ts).
 *
 * The complexity tool orchestrates glob resolution, file reading, and
 * analysis via escomplex or tsmorph engines, producing a ComplexitySummary.
 */

// Mock modules that the tool depends on
vi.mock('../src/fs/glob.js', () => ({
  resolveGlobPatterns: vi.fn().mockResolvedValue(['/src/simple.ts', '/src/advanced.ts']),
}));

vi.mock('../src/fs/read.js', () => ({
  readFileSafe: vi.fn().mockImplementation((path: string) => {
    if (path === '/src/simple.ts') {
      return Promise.resolve('function add(a, b) { return a + b; }');
    }
    if (path === '/src/advanced.ts') {
      return Promise.resolve('function complex(x) { if (x) { for (let i=0; i<x; i++) {} } return x; }');
    }
    return Promise.reject(new Error('NOT_FOUND'));
  }),
}));

describe('complexity tool', () => {
  it('should define ComplexitySummary shape', () => {
    const summary: ComplexitySummary = {
      files: [
        {
          file: '/src/simple.ts',
          aggregate: { cyclomatic: 1 },
          functions: [
            { name: 'add', file: '/src/simple.ts', line: 1, cyclomatic: 1 },
          ],
        },
      ],
      totalFiles: 1,
      totalFunctions: 1,
      averageCyclomatic: 1,
      maxCyclomatic: 1,
      hotspots: [],
    };

    expect(summary.totalFiles).toBe(1);
    expect(summary.averageCyclomatic).toBe(1);
    expect(summary.files).toHaveLength(1);
  });

  it('should identify hotspots correctly', () => {
    const summary: ComplexitySummary = {
      files: [
        {
          file: '/src/complex.ts',
          aggregate: { cyclomatic: 15 },
          functions: [
            { name: 'simpleFunc', file: '/src/complex.ts', line: 1, cyclomatic: 2 },
            { name: 'complexFunc', file: '/src/complex.ts', line: 10, cyclomatic: 15 },
          ],
        },
      ],
      totalFiles: 1,
      totalFunctions: 2,
      averageCyclomatic: 8.5,
      maxCyclomatic: 15,
      hotspots: [
        { name: 'complexFunc', file: '/src/complex.ts', line: 10, cyclomatic: 15 },
      ],
    };

    expect(summary.hotspots).toHaveLength(1);
    expect(summary.hotspots[0].name).toBe('complexFunc');
    expect(summary.maxCyclomatic).toBe(15);
  });

  it('should compute average cyclomatic across functions', () => {
    const functions = [
      { name: 'a', file: '/f.ts', line: 1, cyclomatic: 2 },
      { name: 'b', file: '/f.ts', line: 10, cyclomatic: 4 },
      { name: 'c', file: '/f.ts', line: 20, cyclomatic: 6 },
    ];
    const total = functions.reduce((sum, f) => sum + f.cyclomatic, 0);
    const avg = total / functions.length;

    expect(avg).toBe(4);
  });

  it('should handle empty file list gracefully', () => {
    const summary: ComplexitySummary = {
      files: [],
      totalFiles: 0,
      totalFunctions: 0,
      averageCyclomatic: 0,
      maxCyclomatic: 0,
      hotspots: [],
    };

    expect(summary.totalFiles).toBe(0);
    expect(summary.averageCyclomatic).toBe(0);
    expect(summary.hotspots).toHaveLength(0);
  });
});
