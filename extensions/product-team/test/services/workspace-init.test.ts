import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must hoist mocks before imports
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  constants: { F_OK: 0 },
}));

import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { initializeWorkspaces } from '../../src/services/workspace-init.js';
import type { ProjectConfig } from '../../src/config/plugin-config.js';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

const mockSpawn = vi.mocked(spawn);
const mockAccess = vi.mocked(access);

function makeProjectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projects: [
      { id: 'vibe-flow', repo: 'luiss/vibe-flow', workspace: '/workspaces/vibe-flow' },
    ],
    activeProject: 'vibe-flow',
    ...overrides,
  };
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
  };
}

/**
 * Factory: creates a fake ChildProcess that emits 'close' on nextTick.
 * Must be called lazily (inside mockImplementationOnce) so that the
 * 'close' event fires AFTER runGit() attaches its listener.
 */
function makeFakeProcess(exitCode = 0, stderrData = ''): ChildProcess {
  const emitter = new EventEmitter() as ChildProcess;
  const stderrEmitter = new EventEmitter() as NodeJS.ReadableStream;
  (emitter as unknown as { stderr: NodeJS.ReadableStream }).stderr = stderrEmitter;
  (emitter as unknown as { stdout: null }).stdout = null;

  process.nextTick(() => {
    if (stderrData) {
      stderrEmitter.emit('data', Buffer.from(stderrData));
    }
    emitter.emit('close', exitCode);
  });

  return emitter;
}

describe('initializeWorkspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clones repo when workspace does not exist', async () => {
    mockAccess.mockRejectedValueOnce(new Error('ENOENT'));
    mockSpawn.mockImplementationOnce(() => makeFakeProcess(0));

    const logger = makeLogger();
    await initializeWorkspaces(makeProjectConfig(), logger);

    const [cmd, args] = mockSpawn.mock.calls[0]!;
    expect(cmd).toBe('git');
    expect(args).toContain('clone');
    expect(args).toContain('--depth');
    expect(args).toContain('1');
    expect(args).toContain('https://github.com/luiss/vibe-flow.git');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('cloning'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('cloned'));
  });

  it('pulls latest when workspace already exists', async () => {
    mockAccess.mockResolvedValueOnce(undefined);
    mockSpawn.mockImplementationOnce(() => makeFakeProcess(0));

    const logger = makeLogger();
    await initializeWorkspaces(makeProjectConfig(), logger);

    const [cmd, args] = mockSpawn.mock.calls[0]!;
    expect(cmd).toBe('git');
    expect(args).toEqual(['pull', 'origin', 'main']);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('pull'));
  });

  it('logs a warning when clone fails', async () => {
    mockAccess.mockRejectedValueOnce(new Error('ENOENT'));
    mockSpawn.mockImplementationOnce(() => makeFakeProcess(128, 'fatal: repository not found'));

    const logger = makeLogger();
    await initializeWorkspaces(makeProjectConfig(), logger);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('clone failed'));
  });

  it('logs a warning when pull fails', async () => {
    mockAccess.mockResolvedValueOnce(undefined);
    mockSpawn.mockImplementationOnce(() => makeFakeProcess(1, 'fatal: could not read Username'));

    const logger = makeLogger();
    await initializeWorkspaces(makeProjectConfig(), logger);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('pull failed'));
  });

  it('skips projects with missing repo', async () => {
    const config: ProjectConfig = {
      projects: [{ id: 'bad', repo: '', workspace: '/workspaces/bad' }],
      activeProject: '',
    };
    const logger = makeLogger();
    await initializeWorkspaces(config, logger);

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('missing'));
  });

  it('skips projects with unsafe repo name', async () => {
    const config: ProjectConfig = {
      projects: [{ id: 'x', repo: 'bad;rm -rf /', workspace: '/workspaces/x' }],
      activeProject: '',
    };
    const logger = makeLogger();
    await initializeWorkspaces(config, logger);

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('unsafe repo'));
  });

  it('skips projects with unsafe workspace path', async () => {
    const config: ProjectConfig = {
      projects: [{ id: 'x', repo: 'owner/repo', workspace: '/workspaces/$(evil)' }],
      activeProject: '',
    };
    const logger = makeLogger();
    await initializeWorkspaces(config, logger);

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('unsafe workspace'));
  });

  it('processes multiple projects independently', async () => {
    const config: ProjectConfig = {
      projects: [
        { id: 'a', repo: 'owner/a', workspace: '/workspaces/a' },
        { id: 'b', repo: 'owner/b', workspace: '/workspaces/b' },
      ],
      activeProject: 'a',
    };
    mockAccess.mockResolvedValueOnce(undefined);
    mockAccess.mockResolvedValueOnce(undefined);
    mockSpawn.mockImplementationOnce(() => makeFakeProcess(0));
    mockSpawn.mockImplementationOnce(() => makeFakeProcess(0));

    const logger = makeLogger();
    await initializeWorkspaces(config, logger);

    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });
});
