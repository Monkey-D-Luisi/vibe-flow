import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';
import { __test__ as toolInternals } from '../src/mcp/tools.js';

const { toolHandlers, toolValidators } = toolInternals;

const newTaskId = () => `TR-${ulid()}`;

describe('MCP tools contract smoke tests', () => {
  it('enforces additionalProperties=false on task.create', () => {
    const validator = toolValidators['task.create'];
    const valid = validator({
      title: 'Test task',
      acceptance_criteria: ['AC'],
      scope: 'minor',
      extra: true
    });
    expect(valid).toBe(false);
  });

  it('creates and retrieves a task record', async () => {
    const created = await toolHandlers['task.create']({
      title: 'Test',
      acceptance_criteria: ['AC'],
      scope: 'minor'
    });
    const fetched = await toolHandlers['task.get']({ id: created.id });
    expect(fetched.id).toBe(created.id);
    expect(fetched.status).toBe('po');
  });

  it('returns 404 for unknown task id', async () => {
    await expect(
      toolHandlers['task.get']({ id: 'TR-AAAAAAAAAAAAAAAAAAAAAAAAAA' })
    ).rejects.toMatchObject({ code: 404 });
  });

  it('fails optimistic lock on task.update with 409', async () => {
    const created = await toolHandlers['task.create']({
      title: 'Lock test',
      acceptance_criteria: ['AC'],
      scope: 'minor'
    });
    await expect(
      toolHandlers['task.update']({ id: created.id, if_rev: created.rev + 5, patch: { title: 'Nope' } })
    ).rejects.toMatchObject({ code: 409 });
  });

  it('fails optimistic lock on task.transition with stale rev', async () => {
    const created = await toolHandlers['task.create']({
      title: 'Transition test',
      acceptance_criteria: ['AC'],
      scope: 'major'
    });
    await expect(
      toolHandlers['task.transition']({
        id: created.id,
        to: 'arch',
        if_rev: created.rev + 2
      })
    ).rejects.toMatchObject({ code: 409 });
  });

  it('enforces lease exclusivity with 423', async () => {
    const created = await toolHandlers['task.create']({
      title: 'Lease task',
      acceptance_criteria: ['AC'],
      scope: 'minor'
    });
    await toolHandlers['state.acquire_lock']({
      task_id: created.id,
      owner_agent: 'agent-1',
      ttl_seconds: 60
    });
    await expect(
      toolHandlers['state.acquire_lock']({
        task_id: created.id,
        owner_agent: 'agent-2',
        ttl_seconds: 60
      })
    ).rejects.toMatchObject({ code: 423 });
  });

  it('allows lease reacquisition after TTL expires', async () => {
    const created = await toolHandlers['task.create']({
      title: 'Lease expiry',
      acceptance_criteria: ['AC'],
      scope: 'minor'
    });
    await toolHandlers['state.acquire_lock']({
      task_id: created.id,
      owner_agent: 'agent-1',
      ttl_seconds: 1
    });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await expect(
      toolHandlers['state.acquire_lock']({
        task_id: created.id,
        owner_agent: 'agent-2',
        ttl_seconds: 60
      })
    ).resolves.toMatchObject({ owner_agent: 'agent-2' });
  });

  it('appends events only when orchestrator state exists', async () => {
    const created = await toolHandlers['task.create']({
      title: 'Event task',
      acceptance_criteria: ['AC'],
      scope: 'minor'
    });
    await expect(
      toolHandlers['state.append_event']({
        task_id: created.id,
        type: 'transition',
        payload: { from: 'po', to: 'arch' }
      })
    ).rejects.toMatchObject({ code: 404 });
  });
});
