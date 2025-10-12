import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ulid } from 'ulid';

vi.mock('../../../tooling/quality-mcp/src/tools/gate_enforce.js', () => ({
  gateEnforce: vi.fn()
}));

import { gateEnforce } from '../../../tooling/quality-mcp/src/tools/gate_enforce.js';
import * as runnerModule from '../src/orchestrator/runner.js';
import { type FastTrackContext } from '../src/domain/FastTrack.js';
import { type TaskRecord } from '../src/domain/TaskRecord.js';

const { runAgent, runOrchestratorStep, __test__: runnerInternals } = runnerModule;

const { repo, stateRepo, fastTrackGitHub } = runnerInternals;
const gateEnforceMock = vi.mocked(gateEnforce);

const makeGateMetrics = () => ({
  tests: { total: 24, failed: 0 },
  coverage: { lines: 0.87 },
  lint: { errors: 0, warnings: 1 },
  complexity: { avgCyclomatic: 3.2, maxCyclomatic: 7.1 }
});

beforeEach(() => {
  gateEnforceMock.mockReset();
  gateEnforceMock.mockResolvedValue({
    passed: true,
    metrics: makeGateMetrics(),
    violations: []
  });
});

const createTask = (overrides: Partial<TaskRecord> & { id?: string } = {}) => {
  const task = repo.create({
    id: overrides.id ?? `TR-${ulid()}`,
    title: overrides.title ?? 'Test Task',
    acceptance_criteria: overrides.acceptance_criteria ?? ['AC'],
    scope: overrides.scope ?? 'minor',
    status: overrides.status ?? 'po',
    tags: overrides.tags ?? [],
    metrics: overrides.metrics,
    qa_report: overrides.qa_report,
    links: overrides.links ?? {},
    description: overrides.description
  });
  return task;
};

const createState = (taskId: string, current: TaskRecord['status'] = 'po') => {
  const state = stateRepo.get(taskId) ?? stateRepo.create(taskId);
  if (state.current !== current) {
    stateRepo.update(taskId, state.rev, { current, last_agent: state.last_agent });
  }
};

describe('Orchestrator Runner - integration smoke tests', () => {
  it('runs PO step without fast-track and moves to architect', async () => {
    const task = createTask({ scope: 'major' });
    createState(task.id, 'po');

    const result = await runOrchestratorStep(task.id, 'po');
    expect(result.new_state.current).toBe('arch');

    const updated = repo.get(task.id);
    expect(updated?.status).toBe('arch');
    expect(updated?.tags ?? []).not.toContain('fast-track:eligible');
  });

  it('applies fast-track evaluation when context eligible', async () => {
    const task = createTask({ scope: 'minor' });
    createState(task.id, 'po');

    const ctx: FastTrackContext = {
      task,
      diff: { files: ['src/feature.ts'], locAdded: 12, locDeleted: 2 },
      quality: { coverage: 0.85, avgCyclomatic: 3, lintErrors: 0 },
      metadata: { modulesChanged: false, publicApiChanged: false }
    };

    const result = await runOrchestratorStep(task.id, 'po', { fastTrackContext: ctx });
    expect(result.new_state.current).toBe('dev');

    const updated = repo.get(task.id)!;
    expect(updated.status).toBe('dev');
    expect(updated.tags).toContain('fast-track:eligible');
    expect(updated.tags).toContain('fast-track');
  });

  it('notifies GitHub automation when PR number present', async () => {
    const evalSpy = vi.spyOn(fastTrackGitHub, 'onFastTrackEvaluated').mockResolvedValue();
    const task = createTask({
      scope: 'minor',
      links: {
        git: {
          repo: 'org/repo',
          branch: 'feature/fast-track',
          prNumber: 321
        }
      }
    });
    createState(task.id, 'po');

    const ctx: FastTrackContext = {
      task,
      diff: { files: ['src/feature.ts'], locAdded: 10, locDeleted: 1 },
      quality: { coverage: 0.9, avgCyclomatic: 2, lintErrors: 0 },
      metadata: { modulesChanged: false, publicApiChanged: false }
    };

    await runOrchestratorStep(task.id, 'po', { fastTrackContext: ctx });

    expect(evalSpy).toHaveBeenCalledWith(expect.objectContaining({ id: task.id }), expect.objectContaining({ eligible: true }), 321);
    evalSpy.mockRestore();
  });

  it('revokes fast-track post-dev when reviewer reports high violations', async () => {
    const revokeSpy = vi.spyOn(fastTrackGitHub, 'onFastTrackRevoked').mockResolvedValue();
    const task = createTask({
      status: 'dev',
      tags: ['fast-track', 'fast-track:eligible'],
      metrics: { coverage: 0.9, lint: { errors: 0, warnings: 0 } },
      links: {
        git: {
          repo: 'org/repo',
          branch: 'feature/fast-track',
          prNumber: 654
        }
      }
    });
    createState(task.id, 'dev');

    const ctx: FastTrackContext = {
      task,
      diff: { files: ['src/component.ts'], locAdded: 40, locDeleted: 10 },
      quality: { coverage: 0.9, avgCyclomatic: 4, lintErrors: 0 },
      metadata: { modulesChanged: false, publicApiChanged: false }
    };

    const result = await runOrchestratorStep(task.id, 'dev', {
      fastTrackContext: ctx,
      reviewerViolations: [{ severity: 'high', rule: 'SEC-001' }]
    });

    expect(result.fasttrack_revoked).toBe(true);
    expect(result.revocation_reason).toBe('high_violations');

    const updated = repo.get(task.id)!;
    expect(updated.status).toBe('arch');
    expect(updated.tags).toContain('fast-track:revoked');
    expect(updated.tags).not.toContain('fast-track:eligible');
    expect(revokeSpy).toHaveBeenCalledWith(expect.objectContaining({ id: task.id }), expect.objectContaining({ reason: 'high_violations', revoke: true }), 654);
    revokeSpy.mockRestore();
  });

  it('provides baseline runAgent implementations', async () => {
    const output = await runAgent('po', {
      title: 'Task',
      acceptance_criteria: ['AC'],
      scope: 'minor'
    });
    expect(output).toHaveProperty('title');
  });

  it('blocks qa -> pr when QA report has failures', async () => {
    const originalRunner = runnerInternals.defaultAgentRunner;
    runnerInternals.setAgentRunner(async (agent, input) => {
      if (agent === 'qa') {
        return { total: 10, passed: 8, failed: 2, evidence: ['Integration tests failed'] };
      }
      return originalRunner(agent, input);
    });

    const task = createTask({ status: 'qa' });
    createState(task.id, 'qa');

    await expect(runOrchestratorStep(task.id, 'qa')).rejects.toThrow('QA must pass with 0 failures');

    const persisted = repo.get(task.id);
    expect(persisted?.status).toBe('qa');

    runnerInternals.resetAgentRunner();
  });

  it('enforces po_check in the happy path before QA', async () => {
    const task = createTask({ scope: 'major' });
    createState(task.id, 'po');

    await runOrchestratorStep(task.id, 'po');
    expect(stateRepo.get(task.id)?.current).toBe('arch');

    await runOrchestratorStep(task.id, 'architect');
    expect(stateRepo.get(task.id)?.current).toBe('dev');

    await runOrchestratorStep(task.id, 'dev');
    expect(stateRepo.get(task.id)?.current).toBe('review');

    await runOrchestratorStep(task.id, 'reviewer');
    expect(stateRepo.get(task.id)?.current).toBe('po_check');

    await runOrchestratorStep(task.id, 'po');
    expect(stateRepo.get(task.id)?.current).toBe('qa');

    await runOrchestratorStep(task.id, 'qa');
    expect(stateRepo.get(task.id)?.current).toBe('pr');
    expect(repo.get(task.id)?.tags ?? []).not.toContain('quality_gate_failed');
  });

  it('blocks transition when quality gate fails and logs violations', async () => {
    const task = createTask({
      status: 'dev',
      red_green_refactor_log: ['RED', 'GREEN', 'REFACTOR'],
      metrics: { coverage: 0.9, lint: { errors: 0, warnings: 0 } }
    });
    createState(task.id, 'dev');

    gateEnforceMock.mockResolvedValueOnce({
      passed: false,
      metrics: makeGateMetrics(),
      violations: [{ code: 'COVERAGE_BELOW', message: 'Coverage too low' }]
    });

    await expect(runOrchestratorStep(task.id, 'dev')).rejects.toThrow(/Quality gate failed/);

    const events = runnerInternals.eventRepo.search(task.id, 'quality.gate', 5);
    expect(events[0]?.payload?.violations?.[0]?.code).toBe('COVERAGE_BELOW');
    const current = repo.get(task.id);
    expect(current?.status).toBe('dev');
    expect(current?.tags).toContain('quality_gate_failed');
  });
});
