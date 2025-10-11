import { describe, it, expect, beforeEach } from 'vitest';
import { ulid } from 'ulid';
import { __test__ as mcpInternals } from '../src/mcp/tools.js';
import type { TaskRecord } from '../src/domain/TaskRecord.js';
const {
  toolHandlers,
  toolValidators,
  repo,
  stateRepo,
  eventRepo
} = mcpInternals;

const transitionValidator = toolValidators['task.transition'];

const resetRepositories = () => {
  repo.database.exec(`
    DELETE FROM event_log;
    DELETE FROM leases;
    DELETE FROM orchestrator_state;
    DELETE FROM task_records;
  `);
};

const createTask = async (overrides: Partial<TaskRecord> = {}) => {
  const base = await toolHandlers['task.create']({
    title: overrides.title ?? 'Contract Test Task',
    description: overrides.description ?? 'Test description',
    acceptance_criteria: overrides.acceptance_criteria ?? ['AC'],
    scope: overrides.scope ?? 'minor',
    tags: overrides.tags ?? []
  });

  if (overrides.status && overrides.status !== base.status) {
    const updated = repo.update(base.id, base.rev, { status: overrides.status });
    const initialState = stateRepo.get(base.id)!;
    stateRepo.update(base.id, initialState.rev, { current: overrides.status });
    return updated;
  }

  return base;
};

beforeEach(() => {
  resetRepositories();
});

describe('MCP tools contracts', () => {
  it('validates review -> po_check transition using schema-compliant violations', async () => {
    const task = await createTask({ status: 'review' });
    const state = stateRepo.get(task.id)!;

    const args = {
      id: task.id,
      if_rev: task.rev,
      to: 'po_check',
      evidence: {
        violations: [
          {
            rule: 'SOLID-SRP',
            where: 'UserService.ts:42',
            why: 'Method handles multiple responsibilities',
            severity: 'med',
            suggested_fix: 'Extract Validator class'
          }
        ]
      }
    };

    expect(transitionValidator(args)).toBe(true);

    const result = await toolHandlers['task.transition'](args);
    const persisted = repo.get(task.id)!;
    const orchestratorState = stateRepo.get(task.id)!;

    expect(result.status).toBe('po_check');
    expect(persisted.review_notes).toEqual(['SOLID-SRP (UserService.ts:42): Extract Validator class']);
    expect(orchestratorState.current).toBe('po_check');
    expect(orchestratorState.previous).toBe(state.current);
  });

  it('rejects transitions with invalid reviewer severity before hitting the handler', () => {
    const args = {
      id: `TR-${ulid()}`,
      if_rev: 0,
      to: 'po_check',
      evidence: {
        violations: [
          {
            rule: 'SOLID-SRP',
            where: 'UserService.ts:42',
            why: 'Method handles multiple responsibilities',
            severity: 'medium',
            suggested_fix: 'Extract Validator class'
          }
        ]
      }
    };

    transitionValidator(args);
    expect(transitionValidator.errors?.[0]?.message).toContain('must be equal to one of the allowed values');
  });

  it('blocks qa -> pr transition when QA report has failures', async () => {
    const base = await createTask({ status: 'qa', scope: 'major' });
    const task = repo.update(base.id, base.rev, { qa_report: { total: 10, passed: 9, failed: 1 } });
    const currentState = stateRepo.get(task.id)!;
    stateRepo.update(task.id, currentState.rev, { current: 'qa' });

    const args = {
      id: task.id,
      if_rev: task.rev,
      to: 'pr',
      evidence: {
        qa_report: { total: 10, passed: 9, failed: 1 }
      }
    };

    await expect(toolHandlers['task.transition'](args)).rejects.toMatchObject({
      code: 409,
      message: 'QA must pass with 0 failures'
    });

    const persisted = repo.get(task.id)!;
    expect(persisted.status).toBe('qa');
    expect(stateRepo.get(task.id)?.current).toBe('qa');
  });

  it('keeps orchestrator_state in sync when fast-track is revoked post-dev', async () => {
    const base = await createTask({ scope: 'minor' });
    const task = repo.update(base.id, base.rev, {
      status: 'dev',
      tags: ['fast-track', 'fast-track:eligible'],
      metrics: { coverage: 0.9, lint: { errors: 0, warnings: 0 } }
    });
    const state = stateRepo.get(task.id)!;
    stateRepo.update(task.id, state.rev, { current: 'dev' });

    const result = await toolHandlers['fasttrack.guard_post_dev']({
      task_id: task.id,
      diff: { files: ['src/index.ts'], locAdded: 10, locDeleted: 2 },
      quality: { coverage: 0.9, avgCyclomatic: 3, lintErrors: 0 },
      metadata: { modulesChanged: false, publicApiChanged: false },
      reviewer_violations: [{ severity: 'high', rule: 'SEC-001' }]
    });

    expect(result.result.revoke).toBe(true);

    const updatedTask = repo.get(task.id)!;
    const updatedState = stateRepo.get(task.id)!;

    expect(updatedTask.status).toBe('arch');
    expect(updatedTask.tags).toContain('fast-track:revoked');
    expect(updatedState.current).toBe('arch');
    expect(updatedState.previous).toBe('dev');
  });

  it('returns 404 when appending events for unknown state', async () => {
    await expect(
      toolHandlers['state.append_event']({
        task_id: `TR-${ulid()}`,
        type: 'handoff',
        payload: { from_agent: 'po', to_agent: 'architect' }
      })
    ).rejects.toMatchObject({ code: 404 });
  });

  it('appends journal events and retrieves them via state.search', async () => {
    const task = await createTask();
    const state = stateRepo.get(task.id)!;

    await toolHandlers['state.append_event']({
      task_id: task.id,
      type: 'handoff',
      payload: { from_agent: 'po', to_agent: 'architect' }
    });

    const events = await toolHandlers['state.search']({
      task_id: task.id,
      type: 'handoff',
      limit: 10
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      task_id: task.id,
      type: 'handoff',
      payload: { from_agent: 'po', to_agent: 'architect' }
    });

    const persistedState = stateRepo.get(task.id)!;
    expect(persistedState.current).toBe(state.current);
  });
});
