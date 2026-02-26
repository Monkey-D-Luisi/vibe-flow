import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
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
import { qualityGateToolDef } from '../../src/tools/quality-gate.js';

const NOW = '2026-02-25T10:00:00.000Z';

function createDeps(db: Database.Database): ToolDeps {
  let idCounter = 0;
  const taskRepo = new SqliteTaskRepository(db);
  const orchestratorRepo = new SqliteOrchestratorRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const leaseRepo = new SqliteLeaseRepository(db);
  const generateId = () => `01QGATE_${String(++idCounter).padStart(10, '0')}`;
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

describe('quality.gate tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let taskId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    deps = createDeps(db);
    const createTool = taskCreateToolDef(deps);
    const created = await createTool.execute('create', { title: 'Gate task', scope: 'minor' });
    const task = (created.details as { task: { id: string; rev: number } }).task;
    taskId = task.id;

    deps.taskRepo.update(
      taskId,
      {
        metadata: {
          qa_report: {
            total: 10,
            passed: 10,
            failed: 0,
            skipped: 0,
            evidence: ['all green'],
          },
          dev_result: {
            metrics: {
              coverage: 90,
              lint_clean: true,
            },
            red_green_refactor_log: ['red', 'green'],
          },
          quality: {
            lint: {
              errors: 0,
              warnings: 0,
            },
          },
          complexity: {
            avg: 5,
            max: 10,
            files: 3,
          },
        },
      },
      task.rev,
      NOW,
    );
  });

  afterEach(() => {
    db.close();
  });

  it('evaluates gate and persists quality.gate result', async () => {
    const tool = qualityGateToolDef(deps);
    const result = await tool.execute('gate-1', {
      taskId,
      agentId: 'qa',
    });

    const details = result.details as {
      task: { metadata: Record<string, unknown> };
      output: { passed: boolean; violations: unknown[]; alerts: unknown[] };
    };
    expect(details.output.passed).toBe(true);
    expect(details.output.violations).toHaveLength(0);
    expect(details.output.alerts).toHaveLength(0);
    const quality = (details.task.metadata.quality as Record<string, unknown>);
    expect(quality.gate).toBeDefined();
  });

  it('fails when lint or complexity evidence is missing', async () => {
    const task = deps.taskRepo.getById(taskId)!;
    deps.taskRepo.update(
      taskId,
      {
        metadata: {
          qa_report: task.metadata.qa_report,
          dev_result: task.metadata.dev_result,
        },
      },
      task.rev,
      NOW,
    );

    const tool = qualityGateToolDef(deps);
    const result = await tool.execute('gate-2', {
      taskId,
      agentId: 'qa',
    });

    const details = result.details as {
      output: { passed: boolean; violations: Array<{ code: string; message: string }> };
    };
    expect(details.output.passed).toBe(false);
    expect(details.output.violations.some((violation) => violation.code === 'LINT_ERRORS')).toBe(true);
    expect(details.output.violations.some((violation) => violation.code === 'COMPLEXITY_HIGH')).toBe(true);
  });

  it('applies auto-tuned policy from historical gate metrics when enabled', async () => {
    for (let index = 0; index < 6; index += 1) {
      deps.eventLog.logQualityEvent(
        taskId,
        'quality.gate',
        'qa',
        `history-${index}`,
        {
          scope: 'minor',
          metrics: {
            coveragePct: 92,
            lintWarnings: 2,
            maxCyclomatic: 11,
          },
        },
      );
    }

    const tool = qualityGateToolDef(deps);
    const result = await tool.execute('gate-3', {
      taskId,
      agentId: 'qa',
      autoTune: {
        enabled: true,
        minSamples: 5,
        smoothingFactor: 0.5,
        maxDeltas: {
          coverageMinPct: 4,
          lintMaxWarnings: 6,
          complexityMaxCyclomatic: 4,
        },
      },
    });

    const details = result.details as {
      output: { passed: boolean };
      effectivePolicy: {
        coverageMinPct?: number;
        lintMaxWarnings?: number;
        complexityMaxCyclomatic?: number;
      };
      tuning: { applied: boolean; sampleCount: number; adjustments: unknown[] } | null;
    };

    expect(details.output.passed).toBe(true);
    expect(details.tuning?.applied).toBe(true);
    expect(details.tuning?.sampleCount).toBe(6);
    expect(details.tuning?.adjustments.length).toBeGreaterThan(0);
    expect(details.effectivePolicy.coverageMinPct).toBe(74);
    expect(details.effectivePolicy.lintMaxWarnings).toBe(14);
    expect(details.effectivePolicy.complexityMaxCyclomatic).toBe(16);

    const qualityEvents = deps.eventLog
      .getHistory(taskId)
      .filter((event) => event.eventType === 'quality.gate');
    const lastEvent = qualityEvents[qualityEvents.length - 1];
    expect((lastEvent.payload.tuning as { applied?: boolean }).applied).toBe(true);
    expect(lastEvent.payload).toHaveProperty('metrics');
  });

  it('keeps default policy when auto-tune lacks minimum samples', async () => {
    const tool = qualityGateToolDef(deps);
    const result = await tool.execute('gate-4', {
      taskId,
      agentId: 'qa',
      autoTune: {
        enabled: true,
        minSamples: 10,
      },
    });

    const details = result.details as {
      effectivePolicy: {
        coverageMinPct?: number;
        lintMaxWarnings?: number;
        complexityMaxCyclomatic?: number;
      };
      tuning: { applied: boolean; reason?: string } | null;
    };

    expect(details.effectivePolicy.coverageMinPct).toBe(70);
    expect(details.effectivePolicy.lintMaxWarnings).toBe(20);
    expect(details.effectivePolicy.complexityMaxCyclomatic).toBe(20);
    expect(details.tuning?.applied).toBe(false);
    expect(details.tuning?.reason).toContain('Insufficient history samples');
  });

  it('emits structured regression alerts when enabled and thresholds are exceeded', async () => {
    deps.eventLog.logQualityEvent(
      taskId,
      'quality.gate',
      'qa',
      'history-alert-baseline',
      {
        scope: 'minor',
        metrics: {
          coveragePct: 95,
          lintWarnings: 0,
          maxCyclomatic: 8,
        },
      },
    );

    const task = deps.taskRepo.getById(taskId)!;
    deps.taskRepo.update(
      taskId,
      {
        metadata: {
          ...task.metadata,
          dev_result: {
            metrics: {
              coverage: 82,
              lint_clean: true,
            },
            red_green_refactor_log: ['red', 'green'],
          },
          complexity: {
            avg: 8,
            max: 14,
            files: 3,
          },
        },
      },
      task.rev,
      NOW,
    );

    const tool = qualityGateToolDef(deps);
    const result = await tool.execute('gate-5', {
      taskId,
      agentId: 'qa',
      alerts: {
        enabled: true,
        thresholds: {
          coverageDropPct: 5,
          complexityRise: 3,
        },
        noise: {
          cooldownEvents: 5,
        },
      },
    });

    const details = result.details as {
      output: {
        alerts: Array<{
          metric: string;
          baseline: number;
          observed: number;
          delta: number;
          threshold: number;
        }>;
      };
      alerting: {
        baseline: { coveragePct?: number; maxCyclomatic?: number } | null;
        emittedKeys: string[];
      } | null;
    };

    expect(details.output.alerts).toHaveLength(2);
    expect(details.output.alerts.some((alert) => alert.metric === 'coverageDropPct')).toBe(true);
    expect(details.output.alerts.some((alert) => alert.metric === 'complexityRise')).toBe(true);
    expect(details.alerting?.baseline?.coveragePct).toBe(95);
    expect(details.alerting?.baseline?.maxCyclomatic).toBe(8);
    expect(details.alerting?.emittedKeys).toHaveLength(2);

    const qualityEvents = deps.eventLog
      .getHistory(taskId)
      .filter((event) => event.eventType === 'quality.gate');
    const lastEvent = qualityEvents[qualityEvents.length - 1];
    const alerting = lastEvent.payload.alerting as {
      alerts?: unknown[];
      emittedKeys?: unknown[];
    };
    expect(alerting.alerts).toHaveLength(2);
    expect(alerting.emittedKeys).toHaveLength(2);
  });

  it('uses only same-task history when evaluating regression alerts', async () => {
    const createTool = taskCreateToolDef(deps);
    const otherCreated = await createTool.execute('create-other', { title: 'Other task', scope: 'minor' });
    const otherTask = (otherCreated.details as { task: { id: string } }).task;

    deps.eventLog.logQualityEvent(
      otherTask.id,
      'quality.gate',
      'qa',
      'other-task-history',
      {
        scope: 'minor',
        metrics: {
          coveragePct: 95,
          lintWarnings: 0,
          maxCyclomatic: 8,
        },
      },
    );

    const task = deps.taskRepo.getById(taskId)!;
    deps.taskRepo.update(
      taskId,
      {
        metadata: {
          ...task.metadata,
          dev_result: {
            metrics: {
              coverage: 82,
              lint_clean: true,
            },
            red_green_refactor_log: ['red', 'green'],
          },
          complexity: {
            avg: 8,
            max: 14,
            files: 3,
          },
        },
      },
      task.rev,
      NOW,
    );

    const tool = qualityGateToolDef(deps);
    const result = await tool.execute('gate-6', {
      taskId,
      agentId: 'qa',
      alerts: {
        enabled: true,
        thresholds: {
          coverageDropPct: 5,
          complexityRise: 3,
        },
      },
    });

    const details = result.details as {
      output: {
        alerts: unknown[];
      };
      alerting: {
        baseline: { coveragePct?: number; maxCyclomatic?: number } | null;
      } | null;
    };

    expect(details.output.alerts).toHaveLength(0);
    expect(details.alerting?.baseline).toBeNull();
  });
});
