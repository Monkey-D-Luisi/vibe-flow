import { describe, it, expect, vi } from 'vitest';
import { createConfigGetHandler, handleConfigUpdate } from '../src/handlers/config-handlers.js';
import { handleAgentsList, handleAgentsUpdate } from '../src/handlers/agent-handlers.js';
import { handleProjectsList, handleProjectsAdd, handleProjectsRemove } from '../src/handlers/project-handlers.js';
import {
  handlePipelineStatus,
  handleCostsSummary,
  handleEventsStream,
  handleProvidersStatus,
  handleDecisionsList,
} from '../src/handlers/pipeline-handlers.js';

function createMockOptions(params: Record<string, unknown> = {}) {
  const respond = vi.fn();
  return { params, respond } as { params: Record<string, unknown>; respond: ReturnType<typeof vi.fn> };
}

describe('config-handlers', () => {
  it('handleConfigGet returns basePath from factory', () => {
    const handler = createConfigGetHandler('/custom');
    const opts = createMockOptions();
    handler(opts as never);

    expect(opts.respond).toHaveBeenCalledWith(true, expect.objectContaining({ basePath: '/custom' }));
  });

  it('handleConfigUpdate returns updated keys', () => {
    const opts = createMockOptions({ foo: 1, bar: 2 });
    handleConfigUpdate(opts as never);

    expect(opts.respond).toHaveBeenCalledWith(true, { ok: true, updated: ['foo', 'bar'] });
  });
});

describe('agent-handlers', () => {
  it('handleAgentsList returns 10 agents', () => {
    const opts = createMockOptions();
    handleAgentsList(opts as never);

    expect(opts.respond).toHaveBeenCalledWith(true, expect.objectContaining({
      agents: expect.arrayContaining([expect.objectContaining({ id: 'pm' })]),
    }));
    const agents = opts.respond.mock.calls[0][1].agents;
    expect(agents).toHaveLength(10);
  });

  it('handleAgentsUpdate rejects missing id', () => {
    const opts = createMockOptions({});
    handleAgentsUpdate(opts as never);

    expect(opts.respond).toHaveBeenCalledWith(false, expect.objectContaining({ error: 'invalid_params' }));
  });

  it('handleAgentsUpdate accepts valid id', () => {
    const opts = createMockOptions({ id: 'pm' });
    handleAgentsUpdate(opts as never);

    expect(opts.respond).toHaveBeenCalledWith(true, { ok: true, id: 'pm' });
  });
});

describe('project-handlers', () => {
  it('handleProjectsList returns empty array', () => {
    const opts = createMockOptions();
    handleProjectsList(opts as never);

    expect(opts.respond).toHaveBeenCalledWith(true, { projects: [] });
  });

  it('handleProjectsAdd rejects missing name', () => {
    const opts = createMockOptions({ repo: 'https://github.com/foo/bar' });
    handleProjectsAdd(opts as never);

    expect(opts.respond).toHaveBeenCalledWith(false, expect.objectContaining({ error: 'invalid_params' }));
  });

  it('handleProjectsAdd accepts valid params', () => {
    const opts = createMockOptions({ name: 'test', repo: 'https://github.com/foo/bar' });
    handleProjectsAdd(opts as never);

    expect(opts.respond).toHaveBeenCalledWith(true, { ok: true, name: 'test', repo: 'https://github.com/foo/bar' });
  });

  it('handleProjectsRemove rejects missing name', () => {
    const opts = createMockOptions({});
    handleProjectsRemove(opts as never);

    expect(opts.respond).toHaveBeenCalledWith(false, expect.objectContaining({ error: 'invalid_params' }));
  });
});

describe('pipeline-handlers', () => {
  it('handlePipelineStatus returns stages', () => {
    const opts = createMockOptions();
    handlePipelineStatus(opts as never);

    expect(opts.respond).toHaveBeenCalledWith(true, expect.objectContaining({
      stages: expect.arrayContaining(['backlog', 'done']),
    }));
  });

  it('handleCostsSummary returns zero totals', () => {
    const opts = createMockOptions();
    handleCostsSummary(opts as never);

    expect(opts.respond).toHaveBeenCalledWith(true, { totalToday: 0, byAgent: {}, byProvider: {} });
  });

  it('handleEventsStream returns empty events', () => {
    const opts = createMockOptions();
    handleEventsStream(opts as never);

    expect(opts.respond).toHaveBeenCalledWith(true, { events: [] });
  });

  it('handleProvidersStatus returns providers', () => {
    const opts = createMockOptions();
    handleProvidersStatus(opts as never);

    expect(opts.respond).toHaveBeenCalledWith(true, expect.objectContaining({
      providers: expect.arrayContaining([
        expect.objectContaining({ id: 'openai' }),
      ]),
    }));
  });

  it('handleDecisionsList returns empty list', () => {
    const opts = createMockOptions();
    handleDecisionsList(opts as never);

    expect(opts.respond).toHaveBeenCalledWith(true, { decisions: [] });
  });
});
