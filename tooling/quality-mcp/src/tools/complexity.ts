import Ajv from 'ajv/dist/2020.js';
import { posix, resolve, relative } from 'node:path';
import { loadSchema } from '../../../../services/task-mcp/src/utils/loadSchema.js';
import { resolveGlobPatterns } from '../fs/glob.js';
import type { ComplexityUnit, FileComplexity as EngineFileComplexity } from '../complexity/types.js';
import { analyzeWithEscomplex } from '../complexity/escomplex.js';
import { analyzeWithTsMorph } from '../complexity/tsmorph.js';

export type ComplexityEngine = 'escomplex' | 'tsmorph';

export interface ComplexityInput {
  globs?: string[];
  repoRoot?: string;
  exclude?: string[];
  engine?: ComplexityEngine;
  timeoutMs?: number;
}

export interface ComplexityUnitOutput extends ComplexityUnit {}

export interface ComplexityFileOutput {
  path: string;
  avg: number;
  max: number;
  units: ComplexityUnitOutput[];
}

export interface ComplexityOutput {
  avgCyclomatic: number;
  maxCyclomatic: number;
  files: ComplexityFileOutput[];
  meta: {
    engine: ComplexityEngine;
    globs: string[];
    excluded: string[];
  };
}

type Analyzer = (path: string) => Promise<EngineFileComplexity>;

const ajv = new Ajv({ allErrors: true });
const inputSchema = loadSchema('quality_complexity.input.schema.json');
const outputSchema = loadSchema('quality_complexity.output.schema.json');

const validateInput = ajv.compile<ComplexityInput>(inputSchema);
const validateOutput = ajv.compile<ComplexityOutput>(outputSchema);

const DEFAULT_ENGINE: ComplexityEngine = 'escomplex';
const DEFAULT_TIMEOUT_MS = 600000;
const MIN_TIMEOUT_MS = 1000;

function toPosixPath(path: string): string {
  return posix.normalize(path.replace(/\\/g, '/'));
}

function normalizeRelativePath(repoRoot: string, absolutePath: string): string {
  const resolvedRoot = resolve(repoRoot);
  const resolvedFile = resolve(absolutePath);
  const rel = relative(resolvedRoot, resolvedFile) || posix.basename(resolvedFile);
  return toPosixPath(rel);
}

function selectAnalyzer(engine: ComplexityEngine): Analyzer {
  return engine === 'tsmorph' ? analyzeWithTsMorph : analyzeWithEscomplex;
}

function computeFileAggregates(units: ComplexityUnit[]): { avg: number; max: number } {
  if (!units.length) {
    return { avg: 0, max: 0 };
  }
  const total = units.reduce((sum, unit) => sum + unit.cyclomatic, 0);
  const max = units.reduce((highest, unit) => Math.max(highest, unit.cyclomatic), 0);
  return { avg: total / units.length, max };
}

function checkTimeout(deadline: number, filePath: string): void {
  if (Date.now() > deadline) {
    throw new Error(`TIMEOUT: Complexity analysis exceeded timeout while processing ${filePath}`);
  }
}

export async function complexity(input: ComplexityInput): Promise<ComplexityOutput> {
  if (!validateInput(input)) {
    throw new Error(`Invalid input: ${ajv.errorsText(validateInput.errors)}`);
  }

  const engine = input.engine ?? DEFAULT_ENGINE;
  const analyzer = selectAnalyzer(engine);
  const repoRoot = resolve(process.cwd(), input.repoRoot ?? '.');
  const globs = input.globs && input.globs.length > 0 ? input.globs : [
    'services/task-mcp/src/**/*.ts',
    'packages/**/*.ts'
  ];
  const exclude = input.exclude ?? [
    '**/*.test.*',
    '**/__tests__/**',
    '**/fixtures/**',
    '**/*.d.ts'
  ];
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (timeoutMs < MIN_TIMEOUT_MS) {
    throw new Error(`Invalid input: timeoutMs must be >= ${MIN_TIMEOUT_MS}`);
  }
  const deadline = Date.now() + timeoutMs;

  const files = await resolveGlobPatterns(globs, { cwd: repoRoot, exclude });

  if (files.length === 0) {
    throw new Error('NOT_FOUND: No files matched the provided globs');
  }

  const outputFiles: ComplexityFileOutput[] = [];
  const allUnits: ComplexityUnit[] = [];

  const failed: string[] = [];
  let firstParseError: string | null = null;

  const fallbackAnalyzer =
    engine === 'escomplex'
      ? analyzeWithTsMorph
      : null;

  for (const filePath of files) {
    checkTimeout(deadline, filePath);
    let analysis: EngineFileComplexity;
    try {
      analysis = await analyzer(filePath);
    } catch (error) {
      if (fallbackAnalyzer) {
        try {
          analysis = await fallbackAnalyzer(filePath);
        } catch (fallbackError) {
          const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          const relativePath = normalizeRelativePath(repoRoot, filePath);
          failed.push(relativePath);
          if (!firstParseError) {
            firstParseError = `PARSE_ERROR: Failed to analyze ${relativePath} - ${message}`;
          }
          continue;
        }
      } else {
        const message = error instanceof Error ? error.message : String(error);
        const relativePath = normalizeRelativePath(repoRoot, filePath);
        failed.push(relativePath);
        if (!firstParseError) {
          firstParseError = `PARSE_ERROR: Failed to analyze ${relativePath} - ${message}`;
        }
        continue;
      }
    }

    const units = [...analysis.units].sort((a, b) => {
      if (b.cyclomatic !== a.cyclomatic) {
        return b.cyclomatic - a.cyclomatic;
      }
      return a.name.localeCompare(b.name);
    });

    allUnits.push(...units);

    const aggregates = computeFileAggregates(units);

    outputFiles.push({
      path: normalizeRelativePath(repoRoot, filePath),
      avg: aggregates.avg,
      max: aggregates.max,
      units
    });
  }

  outputFiles.sort((a, b) => {
    if (b.max !== a.max) {
      return b.max - a.max;
    }
    if (b.avg !== a.avg) {
      return b.avg - a.avg;
    }
    return a.path.localeCompare(b.path);
  });

  const totalCyclomatic = allUnits.reduce((sum, unit) => sum + unit.cyclomatic, 0);
  const maxCyclomatic = allUnits.reduce((max, unit) => Math.max(max, unit.cyclomatic), 0);
  const avgCyclomatic = allUnits.length ? totalCyclomatic / allUnits.length : 0;

  const output: ComplexityOutput = {
    avgCyclomatic,
    maxCyclomatic,
    files: outputFiles,
    meta: {
      engine,
      globs,
      excluded: exclude,
      failed
    }
  };

  if (!validateOutput(output)) {
    throw new Error(`Invalid output: ${ajv.errorsText(validateOutput.errors)}`);
  }

  if (firstParseError) {
    throw new Error(firstParseError);
  }

  return output;
}
