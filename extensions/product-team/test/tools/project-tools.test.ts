import { describe, it, expect, vi } from 'vitest';
import type { ToolDeps } from '../../src/tools/index.js';
import { createValidator } from '../../src/schemas/validator.js';
import { projectListToolDef } from '../../src/tools/project-list.js';
import { projectSwitchToolDef } from '../../src/tools/project-switch.js';
import { projectRegisterToolDef } from '../../src/tools/project-register.js';

function makeProject(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: `Project ${id}`,
    repo: `owner/${id}`,
    defaultBranch: 'main',
    workspace: `/workspaces/${id}`,
    stitch: { projectId: null },
    quality: { coverageMajor: 80, coverageMinor: 70, maxComplexity: 5.0 },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ToolDeps> = {}): ToolDeps {
  return {
    validate: createValidator(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    ...overrides,
  } as unknown as ToolDeps;
}

describe('project.list', () => {
  it('returns all projects with correct active flag', async () => {
    const projectConfig = {
      projects: [makeProject('alpha'), makeProject('beta')],
      activeProject: 'alpha',
    };
    const deps = makeDeps({ projectConfig });
    const tool = projectListToolDef(deps);

    const result = await tool.execute('id-1', {});
    const details = result.details as { projects: Array<{ id: string; active: boolean }>; activeProject: string };

    expect(details.activeProject).toBe('alpha');
    expect(details.projects).toHaveLength(2);
    expect(details.projects.find((p) => p.id === 'alpha')?.active).toBe(true);
    expect(details.projects.find((p) => p.id === 'beta')?.active).toBe(false);
  });

  it('returns empty projects list when no config provided', async () => {
    const deps = makeDeps({ projectConfig: undefined });
    const tool = projectListToolDef(deps);

    const result = await tool.execute('id-2', {});
    const details = result.details as { projects: unknown[] };
    expect(details.projects).toEqual([]);
  });
});

describe('project.switch', () => {
  it('switches to a registered project', async () => {
    const projectConfig = {
      projects: [makeProject('alpha'), makeProject('beta')],
      activeProject: 'alpha',
    };
    const deps = makeDeps({ projectConfig });
    const tool = projectSwitchToolDef(deps);

    const result = await tool.execute('id-3', { projectId: 'beta' });
    const details = result.details as { switched: boolean; projectId: string };

    expect(details.switched).toBe(true);
    expect(details.projectId).toBe('beta');
    expect(projectConfig.activeProject).toBe('beta');
  });

  it('throws ValidationError for unknown project', async () => {
    const projectConfig = {
      projects: [makeProject('alpha')],
      activeProject: 'alpha',
    };
    const deps = makeDeps({ projectConfig });
    const tool = projectSwitchToolDef(deps);

    await expect(tool.execute('id-4', { projectId: 'nope' })).rejects.toThrow('not found');
  });
});

describe('project.register', () => {
  it('registers a new project and adds it to config', async () => {
    const projectConfig = {
      projects: [makeProject('existing')],
      activeProject: 'existing',
    };
    const deps = makeDeps({ projectConfig });
    const tool = projectRegisterToolDef(deps);

    const result = await tool.execute('id-5', { id: 'new-proj', name: 'New Project', repo: 'owner/new-proj' });
    const details = result.details as { registered: boolean };

    expect(details.registered).toBe(true);
    expect(projectConfig.projects).toHaveLength(2);
    expect(projectConfig.projects[1]?.['id']).toBe('new-proj');
  });

  it('returns registered: false when project already exists', async () => {
    const projectConfig = {
      projects: [makeProject('dup')],
      activeProject: 'dup',
    };
    const deps = makeDeps({ projectConfig });
    const tool = projectRegisterToolDef(deps);

    const result = await tool.execute('id-6', { id: 'dup', name: 'Dup', repo: 'owner/dup' });
    const details = result.details as { registered: boolean; reason: string };

    expect(details.registered).toBe(false);
    expect(details.reason).toMatch(/already exists/);
  });

  it('uses default workspace when not provided', async () => {
    const projectConfig = {
      projects: [],
      activeProject: '',
    };
    const deps = makeDeps({ projectConfig });
    const tool = projectRegisterToolDef(deps);

    await tool.execute('id-7', { id: 'auto', name: 'Auto', repo: 'owner/auto' });

    expect(projectConfig.projects[0]?.['workspace']).toBe('/workspaces/auto');
  });

  it('returns registered: false for invalid project id', async () => {
    const projectConfig = {
      projects: [],
      activeProject: '',
    };
    const deps = makeDeps({ projectConfig });
    const tool = projectRegisterToolDef(deps);

    const result = await tool.execute('id-8a', { id: '../../etc', name: 'Evil', repo: 'owner/evil' });
    const details = result.details as { registered: boolean; reason: string };

    expect(details.registered).toBe(false);
    expect(details.reason).toMatch(/Invalid project id/);
  });

  it('returns registered: false when no project registry is available', async () => {
    const deps = makeDeps({ projectConfig: undefined });
    const tool = projectRegisterToolDef(deps);

    const result = await tool.execute('id-8b', { id: 'valid', name: 'Valid', repo: 'owner/valid' });
    const details = result.details as { registered: boolean; reason: string };

    expect(details.registered).toBe(false);
    expect(details.reason).toMatch(/No project registry/);
  });

});

describe('project.list content', () => {
  it('serializes to valid JSON text', async () => {
    const projectConfig = {
      projects: [makeProject('x')],
      activeProject: 'x',
    };
    const deps = makeDeps({ projectConfig });
    const tool = projectListToolDef(deps);

    const result = await tool.execute('id-8', {});
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });
});
