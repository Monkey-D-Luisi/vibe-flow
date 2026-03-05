import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tryAutoTransition } from '../../src/github/ci-feedback-transition.js';
import { transition } from '../../src/orchestrator/state-machine.js';
import type { NormalizedGithubCiEvent } from '../../src/github/ci-feedback-utils.js';

vi.mock('../../src/orchestrator/state-machine.js', () => ({
  transition: vi.fn(),
}));

const mockedTransition = vi.mocked(transition);

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(overrides?: Partial<NormalizedGithubCiEvent>): NormalizedGithubCiEvent {
  return {
    source: 'github',
    eventName: 'check_run',
    action: 'completed',
    repository: 'acme/vibe-flow',
    branch: 'task/TASK-1-fix',
    prNumber: 42,
    runUrl: 'https://ci.example/run/1',
    overallStatus: 'completed',
    overallConclusion: 'success',
    checks: [
      { name: 'CI / test', status: 'completed', conclusion: 'success', detailsUrl: null },
    ],
    ...overrides,
  };
}

interface MockDeps {
  config: {
    autoTransition: {
      enabled: boolean;
      toStatus: string | null;
      agentId: string;
    };
  };
  taskRepo: {
    getById: ReturnType<typeof vi.fn>;
  };
  orchestratorRepo: {
    getByTaskId: ReturnType<typeof vi.fn>;
  };
  leaseManager: {
    acquire: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
  transitionDeps: Record<string, unknown>;
  logger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
}

function createDeps(overrides?: Partial<MockDeps>): MockDeps {
  return {
    config: {
      autoTransition: {
        enabled: true,
        toStatus: 'qa',
        agentId: 'infra',
      },
    },
    taskRepo: {
      getById: vi.fn().mockReturnValue({ id: 'TASK-1', status: 'in_review', rev: 0 }),
    },
    orchestratorRepo: {
      getByTaskId: vi.fn().mockReturnValue({ taskId: 'TASK-1', rev: 0 }),
    },
    leaseManager: {
      acquire: vi.fn(),
      release: vi.fn(),
    },
    transitionDeps: {},
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
    },
    ...overrides,
  };
}

// ── tryAutoTransition ───────────────────────────────────────────────────────

describe('tryAutoTransition', () => {
  let deps: MockDeps;

  beforeEach(() => {
    deps = createDeps();
    vi.clearAllMocks();
    mockedTransition.mockReturnValue({ effectiveToStatus: 'qa' } as never);
  });

  it('returns disabled reason when autoTransition is disabled', () => {
    deps.config.autoTransition.enabled = false;
    const result = tryAutoTransition('TASK-1', makeEvent(), deps as never);
    expect(result).toEqual({
      attempted: false,
      transitioned: false,
      reason: 'auto-transition-disabled',
    });
  });

  it('returns target-missing reason when toStatus is null', () => {
    deps.config.autoTransition.toStatus = null;
    const result = tryAutoTransition('TASK-1', makeEvent(), deps as never);
    expect(result).toEqual({
      attempted: false,
      transitioned: false,
      reason: 'auto-transition-target-missing',
    });
  });

  it('returns not-success reason when CI conclusion is failure', () => {
    const event = makeEvent({ overallConclusion: 'failure' });
    const result = tryAutoTransition('TASK-1', event, deps as never);
    expect(result).toEqual({
      attempted: false,
      transitioned: false,
      reason: 'ci-conclusion-not-success',
    });
  });

  it('returns not-success reason when CI conclusion is null', () => {
    const event = makeEvent({ overallConclusion: null });
    const result = tryAutoTransition('TASK-1', event, deps as never);
    expect(result).toEqual({
      attempted: false,
      transitioned: false,
      reason: 'ci-conclusion-not-success',
    });
  });

  it('returns task-not-found when task does not exist', () => {
    deps.taskRepo.getById.mockReturnValue(null);
    const result = tryAutoTransition('TASK-MISSING', makeEvent(), deps as never);
    expect(result).toEqual({
      attempted: true,
      transitioned: false,
      reason: 'task-not-found',
    });
  });

  it('returns already-at-target-status when task is already at toStatus', () => {
    deps.taskRepo.getById.mockReturnValue({ id: 'TASK-1', status: 'qa', rev: 0 });
    const result = tryAutoTransition('TASK-1', makeEvent(), deps as never);
    expect(result).toEqual({
      attempted: true,
      transitioned: false,
      reason: 'already-at-target-status',
    });
  });

  it('returns orchestrator-state-not-found when orchestrator is missing', () => {
    deps.orchestratorRepo.getByTaskId.mockReturnValue(null);
    const result = tryAutoTransition('TASK-1', makeEvent(), deps as never);
    expect(result).toEqual({
      attempted: true,
      transitioned: false,
      reason: 'orchestrator-state-not-found',
    });
  });

  it('successfully transitions and releases lease', () => {
    const result = tryAutoTransition('TASK-1', makeEvent(), deps as never);
    expect(result).toEqual({
      attempted: true,
      transitioned: true,
      toStatus: 'qa',
    });
    expect(deps.leaseManager.acquire).toHaveBeenCalledWith('TASK-1', 'infra', 60_000);
    expect(deps.leaseManager.release).toHaveBeenCalledWith('TASK-1', 'infra');
  });

  it('returns failure reason when transition throws', () => {
    mockedTransition.mockImplementation(() => {
      throw new Error('transition-failed');
    });
    const result = tryAutoTransition('TASK-1', makeEvent(), deps as never);
    expect(result).toEqual({
      attempted: true,
      transitioned: false,
      reason: expect.stringContaining('transition-failed'),
    });
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('auto-transition failed'),
    );
    // Lease should still be released in finally block
    expect(deps.leaseManager.release).toHaveBeenCalledWith('TASK-1', 'infra');
  });

  it('returns failure reason when lease acquire throws', () => {
    deps.leaseManager.acquire.mockImplementation(() => {
      throw new Error('lease-conflict');
    });
    const result = tryAutoTransition('TASK-1', makeEvent(), deps as never);
    expect(result).toEqual({
      attempted: true,
      transitioned: false,
      reason: expect.stringContaining('lease-conflict'),
    });
    // Release should NOT be called since lease was never acquired
    expect(deps.leaseManager.release).not.toHaveBeenCalled();
  });

  it('logs warning when lease release fails in finally block', () => {
    deps.leaseManager.release.mockImplementation(() => {
      throw new Error('release-failed');
    });
    const result = tryAutoTransition('TASK-1', makeEvent(), deps as never);
    // Transition itself should still succeed
    expect(result.transitioned).toBe(true);
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to release lease'),
    );
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('release-failed'),
    );
  });

  it('handles transition failure + lease release failure gracefully', () => {
    mockedTransition.mockImplementation(() => {
      throw new Error('transition-boom');
    });
    deps.leaseManager.release.mockImplementation(() => {
      throw new Error('release-boom');
    });
    const result = tryAutoTransition('TASK-1', makeEvent(), deps as never);
    expect(result.transitioned).toBe(false);
    expect(result.reason).toContain('transition-boom');
    // Both warnings should be logged
    expect(deps.logger.warn).toHaveBeenCalledTimes(2);
  });

  it('returns not-success reason for cancelled conclusion', () => {
    const event = makeEvent({ overallConclusion: 'cancelled' });
    const result = tryAutoTransition('TASK-1', event, deps as never);
    expect(result.reason).toBe('ci-conclusion-not-success');
  });

  it('returns not-success reason for timed_out conclusion', () => {
    const event = makeEvent({ overallConclusion: 'timed_out' });
    const result = tryAutoTransition('TASK-1', event, deps as never);
    expect(result.reason).toBe('ci-conclusion-not-success');
  });

  it('calls transition with correct arguments from deps', () => {
    tryAutoTransition('TASK-1', makeEvent(), deps as never);
    expect(mockedTransition).toHaveBeenCalledWith(
      'TASK-1',
      'qa',
      'infra',
      0,
      deps.transitionDeps,
    );
  });

  it('uses agentId from config for lease and transition', () => {
    deps.config.autoTransition.agentId = 'custom-bot';
    tryAutoTransition('TASK-1', makeEvent(), deps as never);

    expect(deps.leaseManager.acquire).toHaveBeenCalledWith('TASK-1', 'custom-bot', 60_000);
    expect(mockedTransition).toHaveBeenCalledWith(
      'TASK-1',
      'qa',
      'custom-bot',
      0,
      deps.transitionDeps,
    );
    expect(deps.leaseManager.release).toHaveBeenCalledWith('TASK-1', 'custom-bot');
  });

  it('proceeds past conclusion check when conclusion is "success"', () => {
    const event = makeEvent({ overallConclusion: 'success' });
    const result = tryAutoTransition('TASK-1', event, deps as never);
    expect(result.reason).not.toBe('ci-conclusion-not-success');
  });

  it('does not call taskRepo when autoTransition is disabled', () => {
    deps.config.autoTransition.enabled = false;
    tryAutoTransition('TASK-1', makeEvent(), deps as never);
    expect(deps.taskRepo.getById).not.toHaveBeenCalled();
    expect(deps.orchestratorRepo.getByTaskId).not.toHaveBeenCalled();
    expect(deps.leaseManager.acquire).not.toHaveBeenCalled();
  });

  it('does not call orchestratorRepo when task is not found', () => {
    deps.taskRepo.getById.mockReturnValue(null);
    tryAutoTransition('TASK-1', makeEvent(), deps as never);
    expect(deps.orchestratorRepo.getByTaskId).not.toHaveBeenCalled();
  });

  it('does not attempt lease acquire when orchestrator state is missing', () => {
    deps.orchestratorRepo.getByTaskId.mockReturnValue(null);
    tryAutoTransition('TASK-1', makeEvent(), deps as never);
    expect(deps.leaseManager.acquire).not.toHaveBeenCalled();
  });

  it('only treats exact "success" string as success (not "Success" or " success ")', () => {
    for (const value of ['Success', ' success ', 'SUCCESS', 'successful']) {
      const result = tryAutoTransition(
        'TASK-1',
        makeEvent({ overallConclusion: value }),
        deps as never,
      );
      expect(result.reason).toBe('ci-conclusion-not-success');
    }
  });
});
