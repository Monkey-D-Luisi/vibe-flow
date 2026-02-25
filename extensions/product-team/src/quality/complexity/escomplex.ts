/**
 * Complexity analysis using escomplex-compatible metrics.
 *
 * Provides cyclomatic complexity, Halstead metrics, and maintainability index
 * for JavaScript/TypeScript source files.
 */

import type { FileComplexity, FunctionComplexity } from './types.js';

interface EscomplexFunctionReport {
  name: string;
  line: number;
  cyclomatic: number;
  halstead?: {
    difficulty?: number;
    effort?: number;
  };
  paramCount?: number;
  lineEnd?: number;
  lineStart?: number;
}

interface EscomplexModuleReport {
  aggregate?: {
    cyclomatic?: number;
  };
  maintainability?: number;
  functions?: EscomplexFunctionReport[];
}

/**
 * Analyze a source file using escomplex-style analysis.
 *
 * @param source - The source code string to analyze
 * @param filePath - Path to the file (for reporting)
 * @param analyze - The escomplex analyse function
 */
export function analyzeWithEscomplex(
  source: string,
  filePath: string,
  analyze: (src: string, options?: Record<string, unknown>) => EscomplexModuleReport,
): FileComplexity {
  const report = analyze(source, {
    logicalor: true,
    switchcase: true,
    forin: false,
    trycatch: false,
    newmi: true,
  });

  const functions: FunctionComplexity[] = (report.functions || []).map((fn) => ({
    name: fn.name || '<anonymous>',
    file: filePath,
    line: fn.line || fn.lineStart || 0,
    cyclomatic: fn.cyclomatic || 1,
    halsteadDifficulty: fn.halstead?.difficulty,
    halsteadEffort: fn.halstead?.effort,
    parameterCount: fn.paramCount,
    lineCount: fn.lineEnd && fn.lineStart ? fn.lineEnd - fn.lineStart + 1 : undefined,
  }));

  return {
    file: filePath,
    aggregate: {
      cyclomatic: report.aggregate?.cyclomatic || 1,
      maintainability: report.maintainability,
    },
    functions,
  };
}
