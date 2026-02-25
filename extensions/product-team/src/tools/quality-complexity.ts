import { relative } from 'node:path';
import { Project } from 'ts-morph';
import escomplex from 'typhonjs-escomplex';
import type { ToolDef, ToolDeps } from './index.js';
import {
  QualityComplexityParams,
  type QualityComplexityParams as QualityComplexityParamsType,
} from '../schemas/quality-complexity.schema.js';
import { assertPathContained } from '../exec/spawn.js';
import { analyzeWithEscomplex } from '../quality/complexity/escomplex.js';
import { analyzeWithTsMorph } from '../quality/complexity/tsmorph.js';
import type { FileComplexity } from '../quality/complexity/types.js';
import { resolveGlobPatterns, readFileSafe } from '../quality/fs.js';
import {
  beginQualityExecution,
  getTaskOrThrow,
  resolveWorkingDir,
  updateTaskMetadata,
} from './quality-tool-common.js';
import { mergeComplexityMetrics } from './quality-metadata.js';

const DEFAULT_GLOBS = ['src/**/*.ts', 'extensions/**/*.ts'];
const DEFAULT_EXCLUDE = ['**/*.test.*', '**/__tests__/**', '**/fixtures/**', '**/*.d.ts'];

interface ComplexityUnit {
  name: string;
  kind: 'function' | 'method' | 'class' | 'arrow' | 'getter' | 'setter';
  cyclomatic: number;
  startLine: number;
  endLine: number;
  loc: number;
  params: number;
}

interface ComplexityFile {
  path: string;
  avg: number;
  max: number;
  units: ComplexityUnit[];
}

interface QualityComplexityOutput {
  avgCyclomatic: number;
  maxCyclomatic: number;
  files: ComplexityFile[];
  meta: {
    engine: 'escomplex' | 'tsmorph';
    globs: string[];
    excluded: string[];
    failed: string[];
  };
}

interface EscomplexLike {
  analyzeModule: (source: string) => unknown;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function classifyKind(name: string): ComplexityUnit['kind'] {
  if (name.includes('.')) {
    return 'method';
  }
  if (name === '<anonymous>') {
    return 'arrow';
  }
  return 'function';
}

function toComplexityFile(filePath: string, report: FileComplexity, cwd: string): ComplexityFile {
  const units = report.functions.map((fn) => {
    const startLine = fn.line > 0 ? fn.line : 1;
    const loc = fn.lineCount ?? 0;
    const endLine = loc > 0 ? startLine + loc - 1 : startLine;
    return {
      name: fn.name,
      kind: classifyKind(fn.name),
      cyclomatic: fn.cyclomatic,
      startLine,
      endLine,
      loc,
      params: fn.parameterCount ?? 0,
    };
  });

  const avg = units.length > 0
    ? round2(units.reduce((sum, unit) => sum + unit.cyclomatic, 0) / units.length)
    : round2(report.aggregate.cyclomatic);
  const max = units.length > 0
    ? Math.max(...units.map((unit) => unit.cyclomatic))
    : report.aggregate.cyclomatic;

  return {
    path: relative(cwd, filePath).replace(/\\/g, '/'),
    avg,
    max,
    units,
  };
}

export function qualityComplexityToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'quality.complexity',
    label: 'Analyze Complexity',
    description: 'Analyze code complexity and persist complexity evidence in task metadata',
    parameters: QualityComplexityParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<QualityComplexityParamsType>(QualityComplexityParams, params);
      const task = getTaskOrThrow(deps, input.taskId);
      const execCtx = beginQualityExecution(deps, input.taskId, input.agentId);
      const globs = input.globs ?? DEFAULT_GLOBS;
      const exclude = input.exclude ?? DEFAULT_EXCLUDE;
      const engine = input.engine ?? 'escomplex';
      const cwd = resolveWorkingDir(deps, input.workingDir);
      const files = await resolveGlobPatterns(globs, { cwd, exclude });
      const failed: string[] = [];
      const outputFiles: ComplexityFile[] = [];

      const project = engine === 'tsmorph'
        ? new Project({
            skipFileDependencyResolution: true,
            useInMemoryFileSystem: false,
          })
        : null;
      const escomplexAnalyzer = escomplex as unknown as EscomplexLike;

      for (const filePath of files) {
        try {
          assertPathContained(filePath, cwd);
          const source = await readFileSafe(filePath);
          const report = engine === 'tsmorph'
            ? analyzeWithTsMorph(
                project!.createSourceFile(filePath, source, { overwrite: true }) as unknown as Parameters<typeof analyzeWithTsMorph>[0],
              )
            : analyzeWithEscomplex(
                source,
                filePath,
                (src) => escomplexAnalyzer.analyzeModule(src) as Parameters<typeof analyzeWithEscomplex>[2] extends (s: string, o?: Record<string, unknown>) => infer R ? R : never,
              );
          outputFiles.push(toComplexityFile(filePath, report, cwd));
        } catch {
          failed.push(filePath.replace(/\\/g, '/'));
        }
      }

      const allUnits = outputFiles.flatMap((file) => file.units);
      const avgCyclomatic = allUnits.length > 0
        ? round2(allUnits.reduce((sum, unit) => sum + unit.cyclomatic, 0) / allUnits.length)
        : 0;
      const maxCyclomatic = allUnits.length > 0
        ? Math.max(...allUnits.map((unit) => unit.cyclomatic))
        : 0;

      const output: QualityComplexityOutput = {
        avgCyclomatic,
        maxCyclomatic,
        files: outputFiles,
        meta: {
          engine,
          globs,
          excluded: exclude,
          failed,
        },
      };

      const metadata = mergeComplexityMetrics(task.metadata, output as unknown as Record<string, unknown>);
      const updatedTask = updateTaskMetadata(deps, task.id, input.rev, metadata);
      deps.eventLog.logQualityEvent(
        task.id,
        'quality.complexity',
        input.agentId,
        execCtx.correlationId,
        {
          avgCyclomatic,
          maxCyclomatic,
          files: outputFiles.length,
        },
      );
      execCtx.logger.info('quality.complexity.complete', {
        durationMs: Date.now() - execCtx.startedAt,
        files: outputFiles.length,
        failed: failed.length,
      });

      const result = { task: updatedTask, output };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
