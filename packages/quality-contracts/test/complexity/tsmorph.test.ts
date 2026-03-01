import { describe, it, expect } from 'vitest';
import { analyzeWithTsMorph } from '../../src/complexity/tsmorph.js';

type TsMorphNode = {
  getKindName(): string;
  getChildren(): TsMorphNode[];
  getText?(): string;
  getOperatorToken?(): { getText(): string };
};

type TsMorphFunctionNode = TsMorphNode & {
  getName?(): string | undefined;
  getStartLineNumber(): number;
  getEndLineNumber(): number;
  getParameters?(): TsMorphNode[];
  getBody?(): TsMorphNode;
  getDescendants(): TsMorphNode[];
};

function makeNode(kind: string, extra?: Partial<TsMorphNode>): TsMorphNode {
  return { getKindName: () => kind, getChildren: () => [], ...extra };
}

function makeFunctionNode(
  name: string,
  startLine: number,
  endLine: number,
  descendants: TsMorphNode[] = [],
  params: TsMorphNode[] = [],
): TsMorphFunctionNode {
  return {
    getKindName: () => 'FunctionDeclaration',
    getChildren: () => [],
    getName: () => name,
    getStartLineNumber: () => startLine,
    getEndLineNumber: () => endLine,
    getParameters: () => params,
    getBody: () => makeNode('Block'),
    getDescendants: () => descendants,
  };
}

function makeSourceFile(
  filePath: string,
  fns: TsMorphFunctionNode[] = [],
  classes: Array<{ name?: string; methods: TsMorphFunctionNode[] }> = [],
  descendants: TsMorphNode[] = [],
) {
  return {
    getFilePath: () => filePath,
    getFunctions: () => fns,
    getClasses: () =>
      classes.map((cls) => ({
        getName: () => cls.name,
        getMethods: () => cls.methods,
      })),
    getDescendants: () => descendants,
  };
}

describe('analyzeWithTsMorph', () => {
  it('returns base complexity 1 for empty file', () => {
    const sf = makeSourceFile('empty.ts');
    const result = analyzeWithTsMorph(sf);
    expect(result.file).toBe('empty.ts');
    expect(result.aggregate.cyclomatic).toBe(1);
    expect(result.functions).toHaveLength(0);
  });

  it('increments complexity for IfStatement descendants', () => {
    const descendants = [makeNode('IfStatement'), makeNode('IfStatement')];
    const sf = makeSourceFile('file.ts', [], [], descendants);
    const result = analyzeWithTsMorph(sf);
    expect(result.aggregate.cyclomatic).toBe(3); // 1 base + 2 ifs
  });

  it('increments complexity for logical operators in BinaryExpression', () => {
    const andNode: TsMorphNode = {
      getKindName: () => 'BinaryExpression',
      getChildren: () => [],
      getOperatorToken: () => ({ getText: () => '&&' }),
    };
    const orNode: TsMorphNode = {
      getKindName: () => 'BinaryExpression',
      getChildren: () => [],
      getOperatorToken: () => ({ getText: () => '||' }),
    };
    const sf = makeSourceFile('file.ts', [], [], [andNode, orNode]);
    const result = analyzeWithTsMorph(sf);
    expect(result.aggregate.cyclomatic).toBe(3);
  });

  it('does not increment for non-logical BinaryExpression operators', () => {
    const plusNode: TsMorphNode = {
      getKindName: () => 'BinaryExpression',
      getChildren: () => [],
      getOperatorToken: () => ({ getText: () => '+' }),
    };
    const sf = makeSourceFile('file.ts', [], [], [plusNode]);
    const result = analyzeWithTsMorph(sf);
    expect(result.aggregate.cyclomatic).toBe(1);
  });

  it('maps standalone function nodes', () => {
    const fnDescendants = [makeNode('IfStatement')];
    const fn = makeFunctionNode('processData', 5, 20, fnDescendants, [makeNode('Parameter'), makeNode('Parameter')]);
    const sf = makeSourceFile('app.ts', [fn]);
    const result = analyzeWithTsMorph(sf);
    expect(result.functions).toHaveLength(1);
    const f = result.functions[0];
    expect(f.name).toBe('processData');
    expect(f.line).toBe(5);
    expect(f.lineCount).toBe(16); // 20 - 5 + 1
    expect(f.cyclomatic).toBe(2); // 1 base + 1 if
    expect(f.parameterCount).toBe(2);
    expect(f.file).toBe('app.ts');
  });

  it('prefixes method names with class name', () => {
    const method = makeFunctionNode('render', 10, 15, []);
    const sf = makeSourceFile('comp.ts', [], [{ name: 'MyComponent', methods: [method] }]);
    const result = analyzeWithTsMorph(sf);
    expect(result.functions[0].name).toBe('MyComponent.render');
  });

  it('handles anonymous class name', () => {
    const method = makeFunctionNode('doSomething', 1, 5, []);
    const sf = makeSourceFile('anon.ts', [], [{ name: undefined, methods: [method] }]);
    const result = analyzeWithTsMorph(sf);
    expect(result.functions[0].name).toBe('<AnonymousClass>.doSomething');
  });

  it('handles anonymous function name', () => {
    const fn: TsMorphFunctionNode = {
      getKindName: () => 'FunctionDeclaration',
      getChildren: () => [],
      getName: () => undefined,
      getStartLineNumber: () => 1,
      getEndLineNumber: () => 3,
      getParameters: () => [],
      getBody: undefined,
      getDescendants: () => [],
    };
    const sf = makeSourceFile('anon.ts', [fn]);
    const result = analyzeWithTsMorph(sf);
    expect(result.functions[0].name).toBe('<anonymous>');
  });
});
