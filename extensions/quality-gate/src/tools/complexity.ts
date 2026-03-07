/**
 * Tool: qgate.complexity
 *
 * Measures cyclomatic complexity of TypeScript source files using
 * regex-based heuristics. This is the standalone CLI-optimised variant
 * with no external AST dependencies.
 *
 * ALGORITHM NOTE: This tool uses a lightweight regex heuristic
 * (countCyclomaticSimple) rather than a full AST parse. It counts
 * decision-point keywords (if, for, while, &&, ||, ??) directly in
 * source text and will produce different (typically lower) numbers than
 * the AST-based quality.complexity tool in the product-team extension.
 * Use product-team's quality.complexity for accurate per-function AST
 * analysis; use this tool for fast CLI/CI scans where approximate
 * complexity trends are sufficient.
 */

import { resolveGlobPatterns } from '@openclaw/quality-contracts/fs/glob';
import { readFileSafe } from '@openclaw/quality-contracts/fs/read';
import { resolve } from 'node:path';
import { assertPathContained } from '@openclaw/quality-contracts/exec/spawn';
import type { ComplexitySummary, FunctionComplexity, FileComplexity } from '@openclaw/quality-contracts/complexity/types';
import {
  assertOptionalStringArray,
  assertOptionalString,
  assertOptionalNumber,
} from '@openclaw/quality-contracts/validate/tools';
import { DEFAULT_THRESHOLDS } from '@openclaw/quality-contracts/complexity/types';

const DEFAULT_GLOBS = ['src/**/*.ts', 'extensions/**/*.ts'];
const DEFAULT_EXCLUDE = ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**', '**/dist/**'];

export interface ComplexityInput {
  globs?: string[];
  exclude?: string[];
  cwd?: string;
  maxCyclomatic?: number;
  topN?: number;
}

export interface ComplexityOutput {
  summary: ComplexitySummary;
  thresholdExceeded: boolean;
  hotspotCount: number;
}

/**
 * Count cyclomatic complexity from source text using simple heuristic.
 * Counts decision points: if, else if, case, for, while, do, catch, &&, ||, ??
 */
function countCyclomaticSimple(source: string): number {
  let complexity = 1;
  const patterns = [
    /\bif\s*\(/g,
    /\belse\s+if\s*\(/g,
    /\bcase\s+/g,
    /\bfor\s*\(/g,
    /\bwhile\s*\(/g,
    /\bdo\s*\{/g,
    /\bcatch\s*\(/g,
    /&&/g,
    /\|\|/g,
    /\?\?/g,
  ];

  for (const pattern of patterns) {
    const matches = source.match(pattern);
    if (matches) {
      complexity += matches.length;
    }
  }

  return complexity;
}

/**
 * Extract function-level complexity from source text using regex heuristics.
 */
function extractFunctions(source: string, filePath: string): FunctionComplexity[] {
  const functions: FunctionComplexity[] = [];
  const lines = source.split('\n');

  // Match function declarations, arrow functions assigned to const/let, and methods
  const fnPatterns = [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/,
    /(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of fnPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        // Find the function body (rough heuristic: count braces)
        let braceCount = 0;
        let started = false;
        let endLine = i;

        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === '{') {
              braceCount++;
              started = true;
            } else if (ch === '}') {
              braceCount--;
            }
          }
          if (started && braceCount <= 0) {
            endLine = j;
            break;
          }
        }

        const fnBody = lines.slice(i, endLine + 1).join('\n');
        const cyclomatic = countCyclomaticSimple(fnBody);

        functions.push({
          name: match[1],
          file: filePath,
          line: i + 1,
          cyclomatic,
          lineCount: endLine - i + 1,
        });
        break;
      }
    }
  }

  return functions;
}

/**
 * Analyze a single file for complexity.
 */
async function analyzeFile(filePath: string): Promise<FileComplexity> {
  const source = await readFileSafe(filePath);
  const functions = extractFunctions(source, filePath);
  const aggregateCyclomatic = countCyclomaticSimple(source);

  return {
    file: filePath,
    aggregate: {
      cyclomatic: aggregateCyclomatic,
    },
    functions,
  };
}

/**
 * Execute complexity analysis tool.
 */
export async function complexityTool(input: ComplexityInput): Promise<ComplexityOutput> {
  const cwd = resolve(input.cwd || process.cwd());
  const globs = input.globs || DEFAULT_GLOBS;
  const exclude = input.exclude || DEFAULT_EXCLUDE;
  const maxCyclomatic = input.maxCyclomatic || DEFAULT_THRESHOLDS.maxFunctionCyclomatic;
  const topN = input.topN || 10;

  // Reject glob patterns containing path traversal
  for (const pattern of globs) {
    if (pattern.includes('..')) {
      throw new Error(`PATH_TRAVERSAL: glob pattern must not contain "..": ${pattern}`);
    }
  }

  const files = await resolveGlobPatterns(globs, { cwd, exclude });

  const fileResults: FileComplexity[] = [];
  for (const file of files) {
    try {
      assertPathContained(file, cwd);
      const result = await analyzeFile(file);
      fileResults.push(result);
    } catch {
      // Skip files that fail path validation or can't be read
    }
  }

  // Collect all functions and find hotspots
  const allFunctions: FunctionComplexity[] = [];
  for (const file of fileResults) {
    allFunctions.push(...file.functions);
  }

  // Sort by cyclomatic complexity descending
  allFunctions.sort((a, b) => b.cyclomatic - a.cyclomatic);

  const hotspots = allFunctions
    .filter((fn) => fn.cyclomatic > maxCyclomatic)
    .slice(0, topN);

  const totalFunctions = allFunctions.length;
  const averageCyclomatic =
    totalFunctions > 0
      ? Math.round((allFunctions.reduce((sum, fn) => sum + fn.cyclomatic, 0) / totalFunctions) * 100) / 100
      : 0;
  const maxCyclomaticFound = allFunctions.length > 0 ? allFunctions[0].cyclomatic : 0;

  const summary: ComplexitySummary = {
    files: fileResults,
    totalFiles: fileResults.length,
    totalFunctions,
    averageCyclomatic,
    maxCyclomatic: maxCyclomaticFound,
    hotspots: allFunctions.slice(0, topN),
  };

  return {
    summary,
    thresholdExceeded: hotspots.length > 0,
    hotspotCount: hotspots.length,
  };
}

/**
 * Tool definition for registration.
 */
export const complexityToolDef = {
  name: 'qgate.complexity',
  description: 'Measure cyclomatic complexity of TypeScript source files using regex heuristics (fast, approximate). For AST-accurate per-function metrics use quality.complexity from product-team.',
  parameters: {
    type: 'object',
    properties: {
      globs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Glob patterns for files to analyze',
        default: DEFAULT_GLOBS,
      },
      exclude: {
        type: 'array',
        items: { type: 'string' },
        description: 'Glob patterns to exclude',
        default: DEFAULT_EXCLUDE,
      },
      cwd: {
        type: 'string',
        description: 'Working directory',
      },
      maxCyclomatic: {
        type: 'number',
        description: 'Maximum cyclomatic complexity threshold per function',
        default: DEFAULT_THRESHOLDS.maxFunctionCyclomatic,
      },
      topN: {
        type: 'number',
        description: 'Number of top hotspots to report',
        default: 10,
      },
    },
    additionalProperties: false,
  },
  execute: async (_id: string, params: Record<string, unknown>) => {
    assertOptionalStringArray(params['globs'], 'globs');
    assertOptionalStringArray(params['exclude'], 'exclude');
    assertOptionalString(params['cwd'], 'cwd');
    assertOptionalNumber(params['maxCyclomatic'], 'maxCyclomatic');
    assertOptionalNumber(params['topN'], 'topN');
    return complexityTool(params as unknown as ComplexityInput);
  },
};
