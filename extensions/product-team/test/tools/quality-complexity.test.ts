import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTestDatabase } from '../helpers.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { SqliteOrchestratorRepository } from '../../src/persistence/orchestrator-repository.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteLeaseRepository } from '../../src/persistence/lease-repository.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import { createValidator } from '../../src/schemas/validator.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';
import type { ToolDeps } from '../../src/tools/index.js';
import { taskCreateToolDef } from '../../src/tools/task-create.js';
import { qualityComplexityToolDef } from '../../src/tools/quality-complexity.js';

const NOW = '2026-02-25T10:00:00.000Z';

interface ComplexityUnit {
  name: string;
  kind: string;
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

interface ComplexityOutput {
  avgCyclomatic: number;
  maxCyclomatic: number;
  files: ComplexityFile[];
  meta: {
    engine: string;
    globs: string[];
    excluded: string[];
    failed: string[];
  };
}

interface ComplexityResult {
  task: { id: string; metadata: Record<string, unknown> };
  output: ComplexityOutput;
}

function createDeps(db: Database.Database): ToolDeps {
  let idCounter = 0;
  const taskRepo = new SqliteTaskRepository(db);
  const orchestratorRepo = new SqliteOrchestratorRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const leaseRepo = new SqliteLeaseRepository(db);
  const generateId = () => `01QCOMP_${String(++idCounter).padStart(10, '0')}`;
  const now = () => NOW;
  return {
    db,
    taskRepo,
    orchestratorRepo,
    leaseRepo,
    eventLog: new EventLog(eventRepo, generateId, now),
    generateId,
    now,
    validate: createValidator(),
    transitionGuardConfig: DEFAULT_TRANSITION_GUARD_CONFIG,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    workspaceDir: process.cwd(),
  };
}

describe('quality.complexity tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let taskId: string;
  let workingDir: string;

  beforeEach(async () => {
    db = createTestDatabase();
    deps = createDeps(db);
    const createTool = taskCreateToolDef(deps);
    const created = await createTool.execute('create', { title: 'Complexity task' });
    taskId = (created.details as { task: { id: string } }).task.id;
    const tempRoot = join(process.cwd(), '.tmp-tests');
    await mkdir(tempRoot, { recursive: true });
    workingDir = await mkdtemp(join(tempRoot, 'complexity-tool-'));
    await mkdir(join(workingDir, 'src'));
    await writeFile(
      join(workingDir, 'src', 'sample.ts'),
      `
      export function sample(a: number): number {
        if (a > 0) {
          return a;
        }
        return 0;
      }
      `,
      'utf8',
    );
  });

  afterEach(async () => {
    db.close();
    await rm(workingDir, { recursive: true, force: true });
  });

  it('stores complexity summary and quality.complexity evidence', async () => {
    const tool = qualityComplexityToolDef(deps);
    const result = await tool.execute('complex-1', {
      taskId,
      agentId: 'dev',
      rev: 0,
      engine: 'tsmorph',
      globs: ['src/**/*.ts'],
      workingDir,
    });

    const metadata = (result.details as ComplexityResult).task.metadata;
    const complexity = metadata.complexity as Record<string, unknown>;
    expect(typeof complexity.avg).toBe('number');
    expect(typeof complexity.max).toBe('number');
    expect(complexity.files).toBe(1);
    const quality = metadata.quality as Record<string, unknown>;
    expect(quality.complexity).toBeDefined();

    const events = deps.eventLog
      .getHistory(taskId)
      .filter((event) => event.eventType === 'quality.complexity');
    expect(events).toHaveLength(1);
  });

  it('uses escomplex engine by default when engine is not specified', async () => {
    const tool = qualityComplexityToolDef(deps);
    const result = await tool.execute('complex-default', {
      taskId,
      agentId: 'dev',
      rev: 0,
      globs: ['src/**/*.ts'],
      workingDir,
    });

    const output = (result.details as ComplexityResult).output;
    expect(output.meta.engine).toBe('escomplex');
    expect(output.files.length).toBeGreaterThanOrEqual(1);
  });

  it('analyzes files with escomplex engine and produces per-file metrics', async () => {
    const tool = qualityComplexityToolDef(deps);
    const result = await tool.execute('complex-escomplex', {
      taskId,
      agentId: 'dev',
      rev: 0,
      engine: 'escomplex',
      globs: ['src/**/*.ts'],
      workingDir,
    });

    const output = (result.details as ComplexityResult).output;
    expect(output.meta.engine).toBe('escomplex');
    expect(output.files.length).toBe(1);
    // escomplex may or may not extract units from TypeScript;
    // per-file avg uses aggregate.cyclomatic when units are empty
    const file = output.files[0];
    expect(file.avg).toBeGreaterThanOrEqual(0);
    expect(file.max).toBeGreaterThanOrEqual(0);
  });

  it('uses default globs and exclude when not provided', async () => {
    const tool = qualityComplexityToolDef(deps);
    const result = await tool.execute('complex-defaults', {
      taskId,
      agentId: 'dev',
      rev: 0,
      engine: 'tsmorph',
      workingDir,
    });

    const output = (result.details as ComplexityResult).output;
    expect(output.meta.globs).toEqual(['src/**/*.ts', 'extensions/**/*.ts']);
    expect(output.meta.excluded).toEqual(['**/*.test.*', '**/__tests__/**', '**/fixtures/**', '**/*.d.ts']);
  });

  it('uses custom globs and exclude when provided', async () => {
    const tool = qualityComplexityToolDef(deps);
    const customGlobs = ['src/**/*.ts'];
    const customExclude = ['**/*.spec.*'];
    const result = await tool.execute('complex-custom', {
      taskId,
      agentId: 'dev',
      rev: 0,
      engine: 'tsmorph',
      globs: customGlobs,
      exclude: customExclude,
      workingDir,
    });

    const output = (result.details as ComplexityResult).output;
    expect(output.meta.globs).toEqual(customGlobs);
    expect(output.meta.excluded).toEqual(customExclude);
  });

  it('returns zero metrics when no files match the globs', async () => {
    const tool = qualityComplexityToolDef(deps);
    const result = await tool.execute('complex-empty', {
      taskId,
      agentId: 'dev',
      rev: 0,
      engine: 'tsmorph',
      globs: ['nonexistent/**/*.ts'],
      workingDir,
    });

    const output = (result.details as ComplexityResult).output;
    expect(output.avgCyclomatic).toBe(0);
    expect(output.maxCyclomatic).toBe(0);
    expect(output.files).toHaveLength(0);
  });

  it('records failed files when analysis throws', async () => {
    await writeFile(
      join(workingDir, 'src', 'broken.ts'),
      '<<<INVALID_SYNTAX>>>!!not valid typescript at all {{{',
      'utf8',
    );

    const tool = qualityComplexityToolDef(deps);
    const result = await tool.execute('complex-fail', {
      taskId,
      agentId: 'dev',
      rev: 0,
      engine: 'escomplex',
      globs: ['src/**/broken.ts'],
      workingDir,
    });

    const output = (result.details as ComplexityResult).output;
    expect(output.meta.failed.length).toBeGreaterThanOrEqual(1);
    expect(output.meta.failed[0]).toContain('broken.ts');
  });

  it('classifies method functions with tsmorph engine', async () => {
    await writeFile(
      join(workingDir, 'src', 'method-class.ts'),
      `
      export class Foo {
        bar(): number {
          if (true) {
            return 1;
          }
          return 0;
        }
      }
      `,
      'utf8',
    );

    const tool = qualityComplexityToolDef(deps);
    const result = await tool.execute('complex-method', {
      taskId,
      agentId: 'dev',
      rev: 0,
      engine: 'tsmorph',
      globs: ['src/method-class.ts'],
      workingDir,
    });

    const output = (result.details as ComplexityResult).output;
    const methodFile = output.files.find((f) => f.path.includes('method-class'));
    expect(methodFile).toBeDefined();
    expect(methodFile!.units.length).toBeGreaterThan(0);
  });

  it('handles files with multiple functions using tsmorph engine', async () => {
    await writeFile(
      join(workingDir, 'src', 'multi.ts'),
      `
      export function add(a: number, b: number): number {
        return a + b;
      }
      export function subtract(a: number, b: number): number {
        if (a > b) {
          return a - b;
        }
        return b - a;
      }
      export function multiply(a: number, b: number, c?: number): number {
        if (c) {
          return a * b * c;
        }
        return a * b;
      }
      `,
      'utf8',
    );

    const tool = qualityComplexityToolDef(deps);
    const result = await tool.execute('complex-multi', {
      taskId,
      agentId: 'dev',
      rev: 0,
      engine: 'tsmorph',
      globs: ['src/multi.ts'],
      workingDir,
    });

    const output = (result.details as ComplexityResult).output;
    const multiFile = output.files.find((f) => f.path.includes('multi'));
    expect(multiFile).toBeDefined();
    expect(multiFile!.units.length).toBeGreaterThanOrEqual(3);
    expect(multiFile!.avg).toBeGreaterThan(0);
    expect(multiFile!.max).toBeGreaterThanOrEqual(multiFile!.avg);
  });

  it('returns valid JSON text content', async () => {
    const tool = qualityComplexityToolDef(deps);
    const result = await tool.execute('complex-json', {
      taskId,
      agentId: 'dev',
      rev: 0,
      engine: 'tsmorph',
      globs: ['src/**/*.ts'],
      workingDir,
    });

    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });

  it('logs quality.complexity event with correct payload', async () => {
    const tool = qualityComplexityToolDef(deps);
    await tool.execute('complex-event', {
      taskId,
      agentId: 'test-agent',
      rev: 0,
      engine: 'tsmorph',
      globs: ['src/**/*.ts'],
      workingDir,
    });

    const events = deps.eventLog
      .getHistory(taskId)
      .filter((event) => event.eventType === 'quality.complexity');
    expect(events).toHaveLength(1);
    const payload = events[0].payload;
    expect(typeof payload.avgCyclomatic).toBe('number');
    expect(typeof payload.maxCyclomatic).toBe('number');
    expect(typeof payload.files).toBe('number');
    expect(typeof payload.correlationId).toBe('string');
  });

  it('handles mixed success and failure across multiple files', async () => {
    await writeFile(
      join(workingDir, 'src', 'good.ts'),
      `export function good(): boolean { return true; }`,
      'utf8',
    );
    await writeFile(
      join(workingDir, 'src', 'bad.ts'),
      '<<<NOT_VALID>>>',
      'utf8',
    );

    const tool = qualityComplexityToolDef(deps);
    const result = await tool.execute('complex-mixed', {
      taskId,
      agentId: 'dev',
      rev: 0,
      engine: 'escomplex',
      globs: ['src/good.ts', 'src/bad.ts'],
      workingDir,
    });

    const output = (result.details as ComplexityResult).output;
    // At least one file should be processed (good or bad or both)
    expect(output.files.length + output.meta.failed.length).toBeGreaterThanOrEqual(1);
  });

  it('correctly rounds cyclomatic values to 2 decimal places', async () => {
    await writeFile(
      join(workingDir, 'src', 'rounding.ts'),
      `
      export function a(x: number): number { return x; }
      export function b(x: number): number { if (x > 0) return x; return -x; }
      export function c(x: number): number { if (x > 0) { if (x > 10) return x; return x + 1; } return -x; }
      `,
      'utf8',
    );

    const tool = qualityComplexityToolDef(deps);
    const result = await tool.execute('complex-round', {
      taskId,
      agentId: 'dev',
      rev: 0,
      engine: 'tsmorph',
      globs: ['src/rounding.ts'],
      workingDir,
    });

    const output = (result.details as ComplexityResult).output;
    // avgCyclomatic should be rounded to 2 decimal places
    const decimalStr = String(output.avgCyclomatic);
    const parts = decimalStr.split('.');
    if (parts.length > 1) {
      expect(parts[1].length).toBeLessThanOrEqual(2);
    }
  });

  it('persists complexity in task metadata with avg, max, and files count', async () => {
    const tool = qualityComplexityToolDef(deps);
    const result = await tool.execute('complex-meta', {
      taskId,
      agentId: 'dev',
      rev: 0,
      engine: 'escomplex',
      globs: ['src/**/*.ts'],
      workingDir,
    });

    const metadata = (result.details as ComplexityResult).task.metadata;
    const complexity = metadata.complexity as Record<string, unknown>;
    expect(complexity).toBeDefined();
    expect(typeof complexity.avg).toBe('number');
    expect(typeof complexity.max).toBe('number');
    expect(typeof complexity.files).toBe('number');
  });

  it('handles tsmorph engine for file with arrow functions (may fall back to aggregate)', async () => {
    await writeFile(
      join(workingDir, 'src', 'arrows.ts'),
      `
      export const handler = (x: number): number => {
        if (x > 0) return x;
        return -x;
      };
      export const noop = (): void => {};
      `,
      'utf8',
    );

    const tool = qualityComplexityToolDef(deps);
    const result = await tool.execute('complex-arrow-ts', {
      taskId,
      agentId: 'dev',
      rev: 0,
      engine: 'tsmorph',
      globs: ['src/arrows.ts'],
      workingDir,
    });

    const output = (result.details as ComplexityResult).output;
    const arrowFile = output.files.find((f) => f.path.includes('arrows'));
    expect(arrowFile).toBeDefined();
    // Arrow functions may or may not be extracted as units depending on tsmorph analysis;
    // in either case, per-file avg/max should be valid numbers from aggregate fallback
    expect(typeof arrowFile!.avg).toBe('number');
    expect(typeof arrowFile!.max).toBe('number');
    expect(arrowFile!.avg).toBeGreaterThanOrEqual(0);
  });

  it('produces per-file avg and max that reflect aggregate when escomplex returns no units', async () => {
    // escomplex on TypeScript often returns no function units,
    // testing the fallback to report.aggregate.cyclomatic
    const tool = qualityComplexityToolDef(deps);
    const result = await tool.execute('complex-aggregate', {
      taskId,
      agentId: 'dev',
      rev: 0,
      engine: 'escomplex',
      globs: ['src/sample.ts'],
      workingDir,
    });

    const output = (result.details as ComplexityResult).output;
    const file = output.files.find((f) => f.path.includes('sample'));
    expect(file).toBeDefined();
    // If units are empty, avg/max come from aggregate; if not, from unit calculations
    expect(typeof file!.avg).toBe('number');
    expect(typeof file!.max).toBe('number');
    expect(file!.avg).toBeGreaterThanOrEqual(0);
  });
});
