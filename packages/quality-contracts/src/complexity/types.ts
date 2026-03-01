/**
 * Shared complexity analysis types.
 *
 * These types are used by both the product-team and quality-gate extensions
 * to represent complexity analysis results in a common format.
 */

export interface FunctionComplexity {
  name: string;
  file: string;
  line: number;
  cyclomatic: number;
  halsteadDifficulty?: number;
  halsteadEffort?: number;
  parameterCount?: number;
  lineCount?: number;
}

export interface FileComplexity {
  file: string;
  aggregate: {
    cyclomatic: number;
    maintainability?: number;
  };
  functions: FunctionComplexity[];
}

export interface ComplexitySummary {
  files: FileComplexity[];
  totalFiles: number;
  totalFunctions: number;
  averageCyclomatic: number;
  maxCyclomatic: number;
  hotspots: FunctionComplexity[];
}

export interface ComplexityThresholds {
  maxCyclomatic: number;
  maxFunctionCyclomatic: number;
  minMaintainability?: number;
}

export const DEFAULT_THRESHOLDS: ComplexityThresholds = {
  maxCyclomatic: 20,
  maxFunctionCyclomatic: 10,
  minMaintainability: 50,
};
