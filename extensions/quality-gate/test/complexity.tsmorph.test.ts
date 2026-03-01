import { describe, it, expect } from 'vitest';
import { analyzeWithTsMorph } from '../src/complexity/tsmorph.js';
import type { FileComplexity } from '@openclaw/quality-contracts/complexity/types';

function createMockNode(kindName: string, children: ReturnType<typeof createMockNode>[] = [], extra?: Record<string, unknown>) {
  return {
    getKindName: () => kindName,
    getChildren: () => children,
    getOperatorToken: extra?.operatorText ? () => ({ getText: () => extra.operatorText as string }) : undefined,
    getText: () => extra?.text as string ?? '',
    ...extra,
  };
}

function createMockFunction(
  name: string,
  descendants: ReturnType<typeof createMockNode>[],
  opts: { startLine?: number; endLine?: number; paramCount?: number } = {},
) {
  const { startLine = 1, endLine = 10, paramCount = 0 } = opts;
  return {
    getKindName: () => 'FunctionDeclaration',
    getChildren: () => [],
    getName: () => name,
    getStartLineNumber: () => startLine,
    getEndLineNumber: () => endLine,
    getParameters: () => Array(paramCount).fill(createMockNode('Parameter')),
    getBody: () => createMockNode('Block'),
    getDescendants: () => descendants,
  };
}

function createMockSourceFile(
  filePath: string,
  functions: ReturnType<typeof createMockFunction>[],
  classes: Array<{ name: string; methods: ReturnType<typeof createMockFunction>[] }> = [],
  descendants: ReturnType<typeof createMockNode>[] = [],
) {
  return {
    getFilePath: () => filePath,
    getFunctions: () => functions,
    getClasses: () =>
      classes.map((c) => ({
        getName: () => c.name,
        getMethods: () => c.methods,
      })),
    getDescendants: () => descendants,
  };
}

describe('analyzeWithTsMorph', () => {
  it('analyzes a simple file with one function', () => {
    const fn = createMockFunction('add', [], { paramCount: 2, startLine: 1, endLine: 3 });
    const sourceFile = createMockSourceFile('/src/math.ts', [fn]);

    const result: FileComplexity = analyzeWithTsMorph(sourceFile as never);
    expect(result.file).toBe('/src/math.ts');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('add');
    expect(result.functions[0].parameterCount).toBe(2);
    expect(result.functions[0].lineCount).toBe(3);
  });

  it('counts if statements as decision points', () => {
    const descendants = [createMockNode('IfStatement')];
    const fn = createMockFunction('decide', descendants);
    const sourceFile = createMockSourceFile('/src/decide.ts', [fn], [], descendants);

    const result = analyzeWithTsMorph(sourceFile as never);
    expect(result.functions[0].cyclomatic).toBe(2); // 1 base + 1 if
  });

  it('counts for/while/do loops', () => {
    const descendants = [
      createMockNode('ForStatement'),
      createMockNode('WhileStatement'),
      createMockNode('DoStatement'),
    ];
    const fn = createMockFunction('loops', descendants);
    const sourceFile = createMockSourceFile('/src/loops.ts', [fn], [], descendants);

    const result = analyzeWithTsMorph(sourceFile as never);
    expect(result.functions[0].cyclomatic).toBe(4); // 1 base + 3 loops
  });

  it('counts logical && and || operators', () => {
    const descendants = [
      createMockNode('BinaryExpression', [], { operatorText: '&&' }),
      createMockNode('BinaryExpression', [], { operatorText: '||' }),
      createMockNode('BinaryExpression', [], { operatorText: '??' }),
    ];
    const fn = createMockFunction('logical', descendants);
    const sourceFile = createMockSourceFile('/src/logical.ts', [fn], [], descendants);

    const result = analyzeWithTsMorph(sourceFile as never);
    expect(result.functions[0].cyclomatic).toBe(4); // 1 base + 3 logical operators
  });

  it('does not count non-logical binary expressions', () => {
    const descendants = [
      createMockNode('BinaryExpression', [], { operatorText: '+' }),
      createMockNode('BinaryExpression', [], { operatorText: '===' }),
    ];
    const fn = createMockFunction('arithmetic', descendants);
    const sourceFile = createMockSourceFile('/src/arith.ts', [fn], [], descendants);

    const result = analyzeWithTsMorph(sourceFile as never);
    expect(result.functions[0].cyclomatic).toBe(1); // base only
  });

  it('counts switch cases', () => {
    const descendants = [
      createMockNode('SwitchCase'),
      createMockNode('SwitchCase'),
      createMockNode('SwitchCase'),
    ];
    const fn = createMockFunction('switcher', descendants);
    const sourceFile = createMockSourceFile('/src/switch.ts', [fn], [], descendants);

    const result = analyzeWithTsMorph(sourceFile as never);
    expect(result.functions[0].cyclomatic).toBe(4); // 1 base + 3 cases
  });

  it('handles class methods', () => {
    const method = createMockFunction('doWork', [createMockNode('IfStatement')], { paramCount: 1 });
    const sourceFile = createMockSourceFile('/src/service.ts', [], [{ name: 'MyService', methods: [method] }]);

    const result = analyzeWithTsMorph(sourceFile as never);
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('MyService.doWork');
    expect(result.functions[0].cyclomatic).toBe(2);
  });

  it('handles anonymous functions', () => {
    const fn = createMockFunction('', []);
    // Override getName to return undefined
    (fn as { getName: () => string | undefined }).getName = () => undefined;
    const sourceFile = createMockSourceFile('/src/anon.ts', [fn as never]);

    const result = analyzeWithTsMorph(sourceFile as never);
    expect(result.functions[0].name).toBe('<anonymous>');
  });

  it('computes aggregate cyclomatic from file-level descendants', () => {
    const fileDescendants = [
      createMockNode('IfStatement'),
      createMockNode('ForStatement'),
      createMockNode('BinaryExpression', [], { operatorText: '&&' }),
    ];
    const sourceFile = createMockSourceFile('/src/complex.ts', [], [], fileDescendants);

    const result = analyzeWithTsMorph(sourceFile as never);
    expect(result.aggregate.cyclomatic).toBe(4); // 1 base + 3 decision points
  });

  it('counts catch clauses', () => {
    const descendants = [createMockNode('CatchClause')];
    const fn = createMockFunction('tryCatch', descendants);
    const sourceFile = createMockSourceFile('/src/try.ts', [fn], [], descendants);

    const result = analyzeWithTsMorph(sourceFile as never);
    expect(result.functions[0].cyclomatic).toBe(2); // 1 base + 1 catch
  });

  it('counts conditional (ternary) expressions', () => {
    const descendants = [createMockNode('ConditionalExpression')];
    const fn = createMockFunction('ternary', descendants);
    const sourceFile = createMockSourceFile('/src/ternary.ts', [fn], [], descendants);

    const result = analyzeWithTsMorph(sourceFile as never);
    expect(result.functions[0].cyclomatic).toBe(2); // 1 base + 1 ternary
  });

  it('counts for-in and for-of loops', () => {
    const descendants = [
      createMockNode('ForInStatement'),
      createMockNode('ForOfStatement'),
    ];
    const fn = createMockFunction('iterators', descendants);
    const sourceFile = createMockSourceFile('/src/iter.ts', [fn], [], descendants);

    const result = analyzeWithTsMorph(sourceFile as never);
    expect(result.functions[0].cyclomatic).toBe(3); // 1 base + 2 iterators
  });
});
