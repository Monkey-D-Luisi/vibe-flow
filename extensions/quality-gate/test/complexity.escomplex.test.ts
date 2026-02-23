import { describe, it, expect } from 'vitest';
import { analyzeWithEscomplex } from '../src/complexity/escomplex.js';
import type { FileComplexity } from '../src/complexity/types.js';

describe('analyzeWithEscomplex', () => {
  it('returns file complexity for a simple function', () => {
    const source = `function add(a, b) { return a + b; }`;
    const mockAnalyze = () => ({
      aggregate: { cyclomatic: 1 },
      maintainability: 171,
      functions: [
        {
          name: 'add',
          line: 1,
          cyclomatic: 1,
          halstead: { difficulty: 2.5, effort: 25 },
          paramCount: 2,
          lineStart: 1,
          lineEnd: 1,
        },
      ],
    });

    const result: FileComplexity = analyzeWithEscomplex(source, '/src/math.ts', mockAnalyze);
    expect(result.file).toBe('/src/math.ts');
    expect(result.aggregate.cyclomatic).toBe(1);
    expect(result.aggregate.maintainability).toBe(171);
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('add');
    expect(result.functions[0].cyclomatic).toBe(1);
    expect(result.functions[0].parameterCount).toBe(2);
    expect(result.functions[0].halsteadDifficulty).toBe(2.5);
    expect(result.functions[0].halsteadEffort).toBe(25);
  });

  it('handles multiple functions', () => {
    const source = `function a() {} function b() {}`;
    const mockAnalyze = () => ({
      aggregate: { cyclomatic: 2 },
      maintainability: 150,
      functions: [
        { name: 'a', line: 1, cyclomatic: 1, lineStart: 1, lineEnd: 1 },
        { name: 'b', line: 1, cyclomatic: 3, lineStart: 1, lineEnd: 5 },
      ],
    });

    const result = analyzeWithEscomplex(source, '/src/multi.ts', mockAnalyze);
    expect(result.functions).toHaveLength(2);
    expect(result.functions[0].name).toBe('a');
    expect(result.functions[1].name).toBe('b');
    expect(result.functions[1].cyclomatic).toBe(3);
    expect(result.functions[1].lineCount).toBe(5);
  });

  it('defaults anonymous function name', () => {
    const mockAnalyze = () => ({
      aggregate: { cyclomatic: 1 },
      functions: [
        { name: '', line: 1, cyclomatic: 1 },
      ],
    });

    const result = analyzeWithEscomplex('', '/src/anon.ts', mockAnalyze);
    expect(result.functions[0].name).toBe('<anonymous>');
  });

  it('defaults cyclomatic to 1 when missing', () => {
    const mockAnalyze = () => ({
      functions: [
        { name: 'fn', line: 1 },
      ],
    });

    const result = analyzeWithEscomplex('', '/src/default.ts', mockAnalyze as never);
    expect(result.aggregate.cyclomatic).toBe(1);
    expect(result.functions[0].cyclomatic).toBe(1);
  });

  it('computes line count from lineStart and lineEnd', () => {
    const mockAnalyze = () => ({
      aggregate: { cyclomatic: 1 },
      functions: [
        { name: 'fn', line: 5, cyclomatic: 2, lineStart: 5, lineEnd: 15 },
      ],
    });

    const result = analyzeWithEscomplex('', '/src/lines.ts', mockAnalyze);
    expect(result.functions[0].lineCount).toBe(11);
  });

  it('returns undefined lineCount when lineEnd/lineStart missing', () => {
    const mockAnalyze = () => ({
      aggregate: { cyclomatic: 1 },
      functions: [
        { name: 'fn', line: 5, cyclomatic: 2 },
      ],
    });

    const result = analyzeWithEscomplex('', '/src/nolines.ts', mockAnalyze);
    expect(result.functions[0].lineCount).toBeUndefined();
  });

  it('passes escomplex options to the analyze function', () => {
    let capturedOptions: Record<string, unknown> | undefined;
    const mockAnalyze = (_src: string, options?: Record<string, unknown>) => {
      capturedOptions = options;
      return { aggregate: { cyclomatic: 1 }, functions: [] };
    };

    analyzeWithEscomplex('', '/src/opts.ts', mockAnalyze);
    expect(capturedOptions).toEqual({
      logicalor: true,
      switchcase: true,
      forin: false,
      trycatch: false,
      newmi: true,
    });
  });
});
