import {
  ArrowFunction,
  BinaryExpression,
  GetAccessorDeclaration,
  MethodDeclaration,
  Node,
  Project,
  ScriptTarget,
  SetAccessorDeclaration,
  SourceFile,
  SyntaxKind
} from 'ts-morph';
import { readFileSafe } from '../fs/read.js';
import type { ComplexityUnit, ComplexityUnitKind, FileComplexity } from './types.js';

const project = new Project({
  useInMemoryFileSystem: true,
  compilerOptions: {
    allowJs: true,
    target: ScriptTarget.ES2020
  }
});

// Avoid overly verbose identifiers when deriving names for anonymous arrow functions.
const MAX_ARROW_NAME_LENGTH = 32;

function createSourceFile(path: string, content: string): SourceFile {
  const existing = project.getSourceFile(path);
  if (existing) {
    existing.replaceWithText(content);
    return existing;
  }
  return project.createSourceFile(path, content, { overwrite: true });
}

function computeCyclomatic(root: Node): number {
  let complexity = 1;

  root.forEachDescendant((node, traversal) => {
    if (isFunctionLikeNode(node) && node !== root) {
      traversal.skip();
      return;
    }

    switch (node.getKind()) {
      case SyntaxKind.IfStatement:
      case SyntaxKind.ForStatement:
      case SyntaxKind.ForOfStatement:
      case SyntaxKind.ForInStatement:
      case SyntaxKind.WhileStatement:
      case SyntaxKind.DoStatement:
      case SyntaxKind.CaseClause:
      case SyntaxKind.CatchClause:
      case SyntaxKind.ConditionalExpression:
        complexity += 1;
        break;
      case SyntaxKind.BinaryExpression: {
        const operator = (node as BinaryExpression).getOperatorToken().getKind();
        if (operator === SyntaxKind.AmpersandAmpersandToken || operator === SyntaxKind.BarBarToken) {
          complexity += 1;
        }
        break;
      }
      default:
        break;
    }
  });

  return complexity;
}

function isFunctionLikeNode(node: Node): node is Node & { getParameters(): any[] } {
  return (
    Node.isFunctionDeclaration(node) ||
    Node.isFunctionExpression(node) ||
    Node.isArrowFunction(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isConstructorDeclaration(node) ||
    Node.isGetAccessorDeclaration(node) ||
    Node.isSetAccessorDeclaration(node)
  );
}

function getLine(node: Node, fallback: number): number {
  const line = node.getStartLineNumber();
  return Number.isFinite(line) ? line : fallback;
}

function getEndLine(node: Node, fallback: number): number {
  const line = node.getEndLineNumber();
  return Number.isFinite(line) ? line : fallback;
}

function getLoc(node: Node): number {
  return Math.max(0, getEndLine(node, 0) - getLine(node, 0) + 1);
}

function getNameFromArrow(fn: ArrowFunction): string {
  const parent = fn.getParent();
  if (!parent) {
    return '<arrow>';
  }
  if (Node.isVariableDeclaration(parent)) {
    return parent.getName();
  }
  if (Node.isPropertyAssignment(parent)) {
    return parent.getNameNode().getText();
  }
  if (Node.isPropertyDeclaration(parent)) {
    return parent.getName();
  }
  if (Node.isReturnStatement(parent) || Node.isExpressionStatement(parent)) {
    return '<arrow>';
  }
  return parent.getText().slice(0, MAX_ARROW_NAME_LENGTH) || '<arrow>';
}

function createUnit(node: Node, kind: ComplexityUnitKind, name: string): ComplexityUnit {
  const cyclomatic = computeCyclomatic(node);
  const startLine = getLine(node, 1);
  const endLine = getEndLine(node, startLine);
  const params = isFunctionLikeNode(node) ? node.getParameters().length : 0;
  return {
    name,
    kind,
    cyclomatic,
    startLine,
    endLine,
    loc: getLoc(node),
    params
  };
}

export async function analyzeWithTsMorph(path: string): Promise<FileComplexity> {
  const content = await readFileSafe(path);
  const sourceFile = createSourceFile(path, content);

  const units: ComplexityUnit[] = [];
  const classMemberMap = new Map<Node, { classUnit: ComplexityUnit; members: ComplexityUnit[] }>();

  const classes = sourceFile.getClasses();

  for (const cls of classes) {
    const name = cls.getName() ?? '<anonymous class>';
    const classUnit: ComplexityUnit = {
      name,
      kind: 'class',
      cyclomatic: 0,
      startLine: getLine(cls, 1),
      endLine: getEndLine(cls, getLine(cls, 1)),
      loc: getLoc(cls),
      params: 0
    };
    units.push(classUnit);
    classMemberMap.set(cls, { classUnit, members: [] });

    const processMember = (member: MethodDeclaration | GetAccessorDeclaration | SetAccessorDeclaration) => {
      if (!member.getBody()) {
        return;
      }
      const memberKind: ComplexityUnitKind =
        Node.isGetAccessorDeclaration(member) ? 'getter'
          : Node.isSetAccessorDeclaration(member) ? 'setter'
          : 'method';
      const unit = createUnit(member, memberKind, member.getName() ?? '<method>');
      units.push(unit);
      const bucket = classMemberMap.get(cls);
      bucket?.members.push(unit);
    };

    cls.getMethods().forEach(processMember);
    cls.getGetAccessors().forEach(processMember);
    cls.getSetAccessors().forEach(processMember);
    cls.getConstructors().forEach((ctor) => {
      if (!ctor.getBody()) {
        return;
      }
      const unit = createUnit(ctor, 'method', 'constructor');
      units.push(unit);
      const bucket = classMemberMap.get(cls);
      bucket?.members.push(unit);
    });
  }

  const functions = sourceFile.getFunctions();
  for (const fn of functions) {
    if (!fn.getBody()) {
      continue;
    }
    units.push(createUnit(fn, 'function', fn.getName() ?? '<function>'));
  }

  const functionExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionExpression);
  for (const expression of functionExpressions) {
    if (!expression.getBody()) {
      continue;
    }
    const parent = expression.getParent();
    let name = '<function>';
    if (Node.isVariableDeclaration(parent)) {
      name = parent.getName();
    } else if (Node.isPropertyAssignment(parent) || Node.isPropertyDeclaration(parent)) {
      name = parent.getName();
    }
    units.push(createUnit(expression, 'function', name));
  }

  const arrowFunctions = sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction);
  for (const arrow of arrowFunctions) {
    units.push(createUnit(arrow, 'arrow', getNameFromArrow(arrow)));
  }

  // Update class aggregate cyclomatic totals
  for (const [, bucket] of classMemberMap.entries()) {
    const { classUnit, members } = bucket;
    classUnit.cyclomatic = members.reduce((sum, unit) => sum + unit.cyclomatic, 0);
  }

  sourceFile.forget();
  return { path, units };
}
