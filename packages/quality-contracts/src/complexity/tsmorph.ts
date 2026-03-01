/**
 * Complexity analysis using ts-morph for TypeScript-specific AST analysis.
 *
 * Provides cyclomatic complexity measurement by counting decision points
 * in the TypeScript AST.
 */

import type { FileComplexity, FunctionComplexity } from './types.js';

/** Decision-point node kinds that increment cyclomatic complexity. */
const DECISION_KINDS = new Set([
  'IfStatement',
  'ConditionalExpression',
  'SwitchCase',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoStatement',
  'CatchClause',
]);

const LOGICAL_OPERATORS = new Set(['&&', '||', '??']);

interface TsMorphNode {
  getKindName(): string;
  getChildren(): TsMorphNode[];
  getText?(): string;
  getOperatorToken?(): { getText(): string };
}

interface TsMorphFunctionNode extends TsMorphNode {
  getName?(): string;
  getStartLineNumber(): number;
  getEndLineNumber(): number;
  getParameters?(): TsMorphNode[];
  getBody?(): TsMorphNode;
  getDescendants(): TsMorphNode[];
}

interface TsMorphSourceFile {
  getFilePath(): string;
  getFunctions(): TsMorphFunctionNode[];
  getClasses(): Array<{
    getMethods(): TsMorphFunctionNode[];
    getName(): string | undefined;
  }>;
  getDescendants(): TsMorphNode[];
}

/**
 * Count cyclomatic complexity from a list of AST nodes.
 */
function countCyclomaticFromNodes(nodes: TsMorphNode[]): number {
  let complexity = 1; // Base complexity

  for (const node of nodes) {
    const kind = node.getKindName();
    if (kind === 'BinaryExpression') {
      const opToken = node.getOperatorToken?.();
      if (opToken && LOGICAL_OPERATORS.has(opToken.getText())) {
        complexity++;
      }
    } else if (DECISION_KINDS.has(kind)) {
      complexity++;
    }
  }

  return complexity;
}

/**
 * Analyze a function node for complexity.
 */
function analyzeFunctionNode(
  fn: TsMorphFunctionNode,
  filePath: string,
  className?: string,
): FunctionComplexity {
  const rawName = fn.getName?.() || '<anonymous>';
  const name = className ? `${className}.${rawName}` : rawName;
  const descendants = fn.getDescendants();
  const cyclomatic = countCyclomaticFromNodes(descendants);
  const startLine = fn.getStartLineNumber();
  const endLine = fn.getEndLineNumber();

  return {
    name,
    file: filePath,
    line: startLine,
    cyclomatic,
    parameterCount: fn.getParameters?.()?.length,
    lineCount: endLine - startLine + 1,
  };
}

/**
 * Analyze a ts-morph SourceFile for complexity metrics.
 */
export function analyzeWithTsMorph(sourceFile: TsMorphSourceFile): FileComplexity {
  const filePath = sourceFile.getFilePath();
  const functions: FunctionComplexity[] = [];

  // Standalone functions
  for (const fn of sourceFile.getFunctions()) {
    functions.push(analyzeFunctionNode(fn, filePath));
  }

  // Class methods
  for (const cls of sourceFile.getClasses()) {
    const className = cls.getName() || '<AnonymousClass>';
    for (const method of cls.getMethods()) {
      functions.push(analyzeFunctionNode(method, filePath, className));
    }
  }

  // Aggregate: file-level complexity
  const allDescendants = sourceFile.getDescendants();
  const aggregateCyclomatic = countCyclomaticFromNodes(allDescendants);

  return {
    file: filePath,
    aggregate: {
      cyclomatic: aggregateCyclomatic,
    },
    functions,
  };
}
