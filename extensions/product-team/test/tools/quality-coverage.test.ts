import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
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
import { qualityCoverageToolDef } from '../../src/tools/quality-coverage.js';

const NOW = '2026-02-25T10:00:00.000Z';

function createDeps(db: Database.Database): ToolDeps {
  let idCounter = 0;
  const taskRepo = new SqliteTaskRepository(db);
  const orchestratorRepo = new SqliteOrchestratorRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const leaseRepo = new SqliteLeaseRepository(db);
  const generateId = () => `01QCOV_${String(++idCounter).padStart(10, '0')}`;
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

describe('quality.coverage tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let taskId: string;
  let workingDir: string;

  beforeEach(async () => {
    db = createTestDatabase();
    deps = createDeps(db);
    const createTool = taskCreateToolDef(deps);
    const created = await createTool.execute('create', { title: 'Coverage task' });
    taskId = (created.details as { task: { id: string } }).task.id;

    const tempRoot = join(process.cwd(), '.tmp-tests');
    await mkdir(tempRoot, { recursive: true });
    workingDir = await mkdtemp(join(tempRoot, 'coverage-tool-'));
    await writeFile(
      join(workingDir, 'coverage-summary.json'),
      JSON.stringify({
        total: {
          lines: { total: 100, covered: 85, skipped: 0, pct: 85 },
          statements: { total: 100, covered: 84, skipped: 0, pct: 84 },
          functions: { total: 20, covered: 18, skipped: 0, pct: 90 },
          branches: { total: 40, covered: 30, skipped: 0, pct: 75 },
        },
        'src/index.ts': {
          lines: { total: 10, covered: 8, skipped: 0, pct: 80 },
          statements: { total: 10, covered: 8, skipped: 0, pct: 80 },
          functions: { total: 2, covered: 2, skipped: 0, pct: 100 },
          branches: { total: 4, covered: 3, skipped: 0, pct: 75 },
        },
      }),
      'utf8',
    );
  });

  afterEach(async () => {
    db.close();
    await rm(workingDir, { recursive: true, force: true });
  });

  it('stores coverage metrics in dev_result and quality branch', async () => {
    const tool = qualityCoverageToolDef(deps);
    const result = await tool.execute('cov-1', {
      taskId,
      agentId: 'dev',
      rev: 0,
      workingDir,
      summaryPath: 'coverage-summary.json',
      format: 'summary',
    });

    const metadata = (result.details as { task: { metadata: Record<string, unknown> } }).task.metadata;
    const devResult = metadata.dev_result as Record<string, unknown>;
    const metrics = devResult.metrics as Record<string, unknown>;
    expect(metrics.coverage).toBe(85);

    const quality = metadata.quality as Record<string, unknown>;
    expect(quality.coverage).toBeDefined();

    const events = deps.eventLog.getHistory(taskId).filter((event) => event.eventType === 'quality.coverage');
    expect(events).toHaveLength(1);
  });

  it('parses LCOV format when format is lcov', async () => {
    const lcovContent = [
      'SF:src/index.ts',
      'LF:10',
      'LH:8',
      'BRF:4',
      'BRH:3',
      'FNF:2',
      'FNH:2',
      'end_of_record',
    ].join('\n');

    await writeFile(join(workingDir, 'lcov.info'), lcovContent, 'utf8');

    const tool = qualityCoverageToolDef(deps);
    const result = await tool.execute('cov-lcov', {
      taskId,
      agentId: 'dev',
      rev: 0,
      workingDir,
      lcovPath: 'lcov.info',
      format: 'lcov',
    });

    const output = (result.details as { output: Record<string, unknown> }).output;
    const total = output.total as Record<string, number>;
    expect(total.lines).toBeGreaterThan(0);
    expect(total.lines).toBeLessThanOrEqual(1);
  });

  it('falls back to lcov when format is auto and summary file is missing', async () => {
    // Remove the summary file so auto mode falls back to lcov
    await rm(join(workingDir, 'coverage-summary.json'), { force: true });

    const lcovContent = [
      'SF:src/main.ts',
      'LF:20',
      'LH:18',
      'BRF:6',
      'BRH:5',
      'FNF:4',
      'FNH:4',
      'end_of_record',
    ].join('\n');

    await mkdir(join(workingDir, 'coverage'), { recursive: true });
    await writeFile(join(workingDir, 'coverage', 'lcov.info'), lcovContent, 'utf8');

    const tool = qualityCoverageToolDef(deps);
    const result = await tool.execute('cov-auto-fallback', {
      taskId,
      agentId: 'dev',
      rev: 0,
      workingDir,
      format: 'auto',
    });

    const output = (result.details as { output: Record<string, unknown> }).output;
    const total = output.total as Record<string, number>;
    expect(total.lines).toBeGreaterThan(0);
  });

  it('throws NOT_FOUND when no coverage report is available', async () => {
    // Remove the summary file and don't create lcov
    await rm(join(workingDir, 'coverage-summary.json'), { force: true });

    const tool = qualityCoverageToolDef(deps);
    await expect(
      tool.execute('cov-missing', {
        taskId,
        agentId: 'dev',
        rev: 0,
        workingDir,
        format: 'auto',
      }),
    ).rejects.toThrow('NOT_FOUND');
  });

  it('rethrows error when format is summary and summary file is missing', async () => {
    await rm(join(workingDir, 'coverage-summary.json'), { force: true });

    const tool = qualityCoverageToolDef(deps);
    await expect(
      tool.execute('cov-summary-missing', {
        taskId,
        agentId: 'dev',
        rev: 0,
        workingDir,
        format: 'summary',
        summaryPath: 'coverage-summary.json',
      }),
    ).rejects.toThrow();
  });

  it('uses custom summaryPath and lcovPath when provided', async () => {
    await writeFile(
      join(workingDir, 'custom-summary.json'),
      JSON.stringify({
        total: {
          lines: { total: 50, covered: 45, skipped: 0, pct: 90 },
          statements: { total: 50, covered: 44, skipped: 0, pct: 88 },
          functions: { total: 10, covered: 9, skipped: 0, pct: 90 },
          branches: { total: 20, covered: 16, skipped: 0, pct: 80 },
        },
      }),
      'utf8',
    );

    const tool = qualityCoverageToolDef(deps);
    const result = await tool.execute('cov-custom-path', {
      taskId,
      agentId: 'dev',
      rev: 0,
      workingDir,
      summaryPath: 'custom-summary.json',
      format: 'summary',
    });

    const output = (result.details as { output: Record<string, unknown> }).output;
    const meta = output.meta as Record<string, unknown>;
    expect(meta.summaryPath).toBe('custom-summary.json');
  });

  it('excludes files matching exclude patterns', async () => {
    await writeFile(
      join(workingDir, 'coverage-with-tests.json'),
      JSON.stringify({
        total: {
          lines: { total: 100, covered: 85, skipped: 0, pct: 85 },
          statements: { total: 100, covered: 84, skipped: 0, pct: 84 },
          functions: { total: 20, covered: 18, skipped: 0, pct: 90 },
          branches: { total: 40, covered: 30, skipped: 0, pct: 75 },
        },
        'src/index.ts': {
          lines: { total: 10, covered: 8, skipped: 0, pct: 80 },
          statements: { total: 10, covered: 8, skipped: 0, pct: 80 },
          functions: { total: 2, covered: 2, skipped: 0, pct: 100 },
          branches: { total: 4, covered: 3, skipped: 0, pct: 75 },
        },
        'src/index.test.ts': {
          lines: { total: 10, covered: 10, skipped: 0, pct: 100 },
          statements: { total: 10, covered: 10, skipped: 0, pct: 100 },
          functions: { total: 2, covered: 2, skipped: 0, pct: 100 },
          branches: { total: 4, covered: 4, skipped: 0, pct: 100 },
        },
      }),
      'utf8',
    );

    const tool = qualityCoverageToolDef(deps);
    const result = await tool.execute('cov-exclude', {
      taskId,
      agentId: 'dev',
      rev: 0,
      workingDir,
      summaryPath: 'coverage-with-tests.json',
      format: 'summary',
      exclude: ['**/*.test.*'],
    });

    const output = (result.details as { output: Record<string, unknown> }).output;
    const files = output.files as Array<Record<string, unknown>>;
    const testFile = files.find((f) => String(f.path).includes('.test.'));
    expect(testFile).toBeUndefined();
  });

  it('uses default exclude when no exclude is provided', async () => {
    const tool = qualityCoverageToolDef(deps);
    const result = await tool.execute('cov-default-exclude', {
      taskId,
      agentId: 'dev',
      rev: 0,
      workingDir,
      summaryPath: 'coverage-summary.json',
      format: 'summary',
    });

    const output = (result.details as { output: Record<string, unknown> }).output;
    const meta = output.meta as Record<string, unknown>;
    expect(meta.excluded).toEqual(['**/*.test.*', '**/__tests__/**', '**/fixtures/**']);
  });

  it('handles LCOV with zero linesFound (returns ratio 1)', async () => {
    const lcovContent = [
      'SF:src/empty.ts',
      'LF:0',
      'LH:0',
      'BRF:0',
      'BRH:0',
      'FNF:0',
      'FNH:0',
      'end_of_record',
    ].join('\n');

    await writeFile(join(workingDir, 'lcov-empty.info'), lcovContent, 'utf8');

    const tool = qualityCoverageToolDef(deps);
    const result = await tool.execute('cov-empty-lcov', {
      taskId,
      agentId: 'dev',
      rev: 0,
      workingDir,
      lcovPath: 'lcov-empty.info',
      format: 'lcov',
    });

    const output = (result.details as { output: Record<string, unknown> }).output;
    const files = output.files as Array<Record<string, number>>;
    expect(files).toHaveLength(1);
    // Zero found → ratio is 1 (full coverage by convention)
    expect(files[0].lines).toBe(1);
    expect(files[0].branches).toBe(1);
    expect(files[0].functions).toBe(1);
  });

  it('returns valid JSON text content', async () => {
    const tool = qualityCoverageToolDef(deps);
    const result = await tool.execute('cov-json', {
      taskId,
      agentId: 'dev',
      rev: 0,
      workingDir,
      summaryPath: 'coverage-summary.json',
      format: 'summary',
    });

    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });

  it('uses auto format and reads summary when both files exist', async () => {
    // Create both summary and lcov
    await mkdir(join(workingDir, 'coverage'), { recursive: true });
    await writeFile(
      join(workingDir, 'coverage', 'coverage-summary.json'),
      JSON.stringify({
        total: {
          lines: { total: 100, covered: 95, skipped: 0, pct: 95 },
          statements: { total: 100, covered: 94, skipped: 0, pct: 94 },
          functions: { total: 20, covered: 19, skipped: 0, pct: 95 },
          branches: { total: 40, covered: 38, skipped: 0, pct: 95 },
        },
      }),
      'utf8',
    );

    const tool = qualityCoverageToolDef(deps);
    const result = await tool.execute('cov-auto-both', {
      taskId,
      agentId: 'dev',
      rev: 0,
      workingDir,
      format: 'auto',
    });

    const output = (result.details as { output: Record<string, unknown> }).output;
    const total = output.total as Record<string, number>;
    // Summary format should be preferred in auto mode
    expect(total.lines).toBeCloseTo(0.95, 2);
  });

  it('handles LCOV with multiple records', async () => {
    const lcovContent = [
      'SF:src/a.ts',
      'LF:20',
      'LH:16',
      'BRF:4',
      'BRH:3',
      'FNF:3',
      'FNH:2',
      'end_of_record',
      'SF:src/b.ts',
      'LF:30',
      'LH:30',
      'BRF:6',
      'BRH:6',
      'FNF:5',
      'FNH:5',
      'end_of_record',
    ].join('\n');

    await writeFile(join(workingDir, 'multi-lcov.info'), lcovContent, 'utf8');

    const tool = qualityCoverageToolDef(deps);
    const result = await tool.execute('cov-multi-lcov', {
      taskId,
      agentId: 'dev',
      rev: 0,
      workingDir,
      lcovPath: 'multi-lcov.info',
      format: 'lcov',
    });

    const output = (result.details as { output: Record<string, unknown> }).output;
    const files = output.files as Array<Record<string, unknown>>;
    expect(files).toHaveLength(2);
  });
});
