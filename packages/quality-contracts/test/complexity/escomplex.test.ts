import { describe, it, expect } from 'vitest';
import { analyzeWithEscomplex } from '../../src/complexity/escomplex.js';

function makeAnalyzer(cyclomaticOverride?: number) {
  return (
    _src: string,
    _options?: Record<string, unknown>,
  ) => ({
    aggregate: { cyclomatic: cyclomaticOverride ?? 3 },
    maintainability: 75,
    functions: [
      {
        name: 'myFunc',
        line: 1,
        lineStart: 1,
        lineEnd: 10,
        cyclomatic: 2,
        halstead: { difficulty: 5, effort: 100 },
        paramCount: 2,
      },
    ],
  });
}

describe('analyzeWithEscomplex', () => {
  it('maps aggregate cyclomatic complexity', () => {
    const result = analyzeWithEscomplex('const x = 1;', 'test.ts', makeAnalyzer(5));
    expect(result.aggregate.cyclomatic).toBe(5);
    expect(result.file).toBe('test.ts');
  });

  it('maps maintainability index', () => {
    const result = analyzeWithEscomplex('const x = 1;', 'test.ts', makeAnalyzer());
    expect(result.aggregate.maintainability).toBe(75);
  });

  it('maps function-level metrics', () => {
    const result = analyzeWithEscomplex('function myFunc() {}', 'test.ts', makeAnalyzer());
    expect(result.functions).toHaveLength(1);
    const fn = result.functions[0];
    expect(fn.name).toBe('myFunc');
    expect(fn.cyclomatic).toBe(2);
    expect(fn.halsteadDifficulty).toBe(5);
    expect(fn.halsteadEffort).toBe(100);
    expect(fn.parameterCount).toBe(2);
    expect(fn.lineCount).toBe(10); // lineEnd - lineStart + 1
    expect(fn.line).toBe(1);
    expect(fn.file).toBe('test.ts');
  });

  it('falls back to 1 when aggregate cyclomatic is missing', () => {
    const analyzerNoAggregate = () => ({ functions: [] });
    const result = analyzeWithEscomplex('', 'empty.ts', analyzerNoAggregate);
    expect(result.aggregate.cyclomatic).toBe(1);
  });

  it('handles anonymous functions', () => {
    const analyzerAnon = () => ({
      aggregate: { cyclomatic: 1 },
      functions: [{ name: '', line: 1, cyclomatic: 1 }],
    });
    const result = analyzeWithEscomplex('const fn = () => {};', 'anon.ts', analyzerAnon);
    expect(result.functions[0].name).toBe('<anonymous>');
  });

  it('passes options to the analyzer', () => {
    const receivedOptions: Record<string, unknown>[] = [];
    const capturingAnalyzer = (_src: string, opts?: Record<string, unknown>) => {
      if (opts) receivedOptions.push(opts);
      return { aggregate: { cyclomatic: 1 }, functions: [] };
    };
    analyzeWithEscomplex('', 'file.ts', capturingAnalyzer);
    expect(receivedOptions[0]).toMatchObject({ logicalor: true, newmi: true });
  });
});
