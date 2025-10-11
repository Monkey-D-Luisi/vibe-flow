import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';
import { runAgent, runOrchestratorStep, __test__ as runnerInternals } from '../src/orchestrator/runner.js';
import { type FastTrackContext } from '../src/domain/FastTrack.js';
import { type TaskRecord } from '../src/domain/TaskRecord.js';

const { repo, stateRepo } = runnerInternals;

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

const createState = (taskId: string, current = 'po') => {
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

  it('revokes fast-track post-dev when reviewer reports high violations', async () => {
    const task = createTask({
      status: 'dev',
      tags: ['fast-track', 'fast-track:eligible'],
      metrics: { coverage: 0.9, lint: { errors: 0, warnings: 0 } }
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
  });

  it('provides baseline runAgent implementations', async () => {
    const output = await runAgent('po', {
      title: 'Task',
      acceptance_criteria: ['AC'],
      scope: 'minor'
    });
    expect(output).toHaveProperty('title');
  });
});
