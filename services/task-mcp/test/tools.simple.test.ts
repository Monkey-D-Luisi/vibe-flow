import { describe, it, expect } from 'vitest';
import { __test__ as toolInternals } from '../src/mcp/tools.js';

const { toolHandlers, toolValidators } = toolInternals;

describe('MCP tools – contract smoke tests', () => {
  it('rejects additional properties for task.create', () => {
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

  it('returns 404 when fetching unknown task', async () => {
    await expect(toolHandlers['task.get']({ id: 'TR-UNKNOWN' })).rejects.toMatchObject({
      code: 404
    });
  });

  it('fails optimistic lock with 409', async () => {
    const created = await toolHandlers['task.create']({
      title: 'Lock test',
      acceptance_criteria: ['AC'],
      scope: 'minor'
    });
    await expect(
      toolHandlers['task.update']({ id: created.id, if_rev: 999, patch: { title: 'Nope' } })
    ).rejects.toMatchObject({ code: 409 });
  });

  it('enforces lease exclusivity with 423', async () => {
    const created = await toolHandlers['task.create']({
      title: 'Lease task',
      acceptance_criteria: ['AC'],
      scope: 'minor'
    });
    await toolHandlers['state.acquire_lock']({ task_id: created.id, owner_agent: 'agent-1', ttl_seconds: 60 });
    await expect(
      toolHandlers['state.acquire_lock']({ task_id: created.id, owner_agent: 'agent-2', ttl_seconds: 60 })
    ).rejects.toMatchObject({ code: 423 });
  });

  it('appends events only when state exists', async () => {
    const created = await toolHandlers['task.create']({
      title: 'Event task',
      acceptance_criteria: ['AC'],
      scope: 'minor'
    });
    // state.append_event should fail until orchestrator state exists
    await expect(
      toolHandlers['state.append_event']({
        task_id: created.id,
        type: 'transition',
        payload: { from: 'po', to: 'arch' }
      })
    ).rejects.toMatchObject({ code: 404 });
  });
});
