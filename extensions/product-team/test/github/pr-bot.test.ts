import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TaskRecord } from '../../src/domain/task-record.js';
import {
  PrBotAutomation,
  type PrBotAfterToolCallEvent,
  type PrBotHookContext,
} from '../../src/github/pr-bot.js';

function createTask(overrides?: Partial<TaskRecord>): TaskRecord {
  return {
    id: 'TASK-100',
    title: 'Automate PR flow',
    status: 'in_review',
    scope: 'major',
    assignee: null,
    tags: ['epic:EP04', 'area:vcs'],
    metadata: {
      acceptance_criteria: ['labels synced', 'reviewers assigned'],
      taskPath: 'docs/tasks/0008-pr-bot-skill.md',
    },
    createdAt: '2026-02-25T12:00:00.000Z',
    updatedAt: '2026-02-25T12:00:00.000Z',
    rev: 0,
    ...overrides,
  };
}

function createEvent(
  overrides?: Partial<PrBotAfterToolCallEvent>,
): PrBotAfterToolCallEvent {
  return {
    toolName: 'vcs.pr.create',
    params: { taskId: 'TASK-100' },
    result: { details: { number: 77, url: 'https://example/pr/77', cached: false } },
    ...overrides,
  };
}

function createContext(overrides?: Partial<PrBotHookContext>): PrBotHookContext {
  return {
    toolName: 'vcs.pr.create',
    agentId: 'infra',
    sessionKey: 'sess-1',
    ...overrides,
  };
}

describe('PrBotAutomation', () => {
  const taskReader = { getById: vi.fn<[(string)], TaskRecord | null>() };
  const labelService = { syncLabels: vi.fn(async () => undefined) };
  const prService = { updateTaskPr: vi.fn(async () => undefined) };
  const ghClient = {
    requestReviewers: vi.fn(async () => undefined),
    commentPr: vi.fn(async () => undefined),
  };
  const eventLog = { logVcsEvent: vi.fn() };
  const logger = { info: vi.fn(), warn: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    taskReader.getById.mockReturnValue(createTask());
  });

  it('ignores non-vcs.pr.create tool events', async () => {
    const bot = new PrBotAutomation({
      taskReader,
      labelService,
      prService,
      ghClient,
      eventLog,
      logger,
      githubOwner: 'acme',
      githubRepo: 'vibe',
      config: {
        enabled: true,
        reviewers: { default: ['infra-reviewer'], major: [], minor: [], patch: [] },
      },
    });

    await bot.handleAfterToolCall(
      createEvent({ toolName: 'task.update' }),
      createContext({ toolName: 'task.update' }),
    );

    expect(labelService.syncLabels).not.toHaveBeenCalled();
    expect(prService.updateTaskPr).not.toHaveBeenCalled();
    expect(ghClient.requestReviewers).not.toHaveBeenCalled();
    expect(ghClient.commentPr).not.toHaveBeenCalled();
  });

  it('skips side effects for cached vcs.pr.create results', async () => {
    const bot = new PrBotAutomation({
      taskReader,
      labelService,
      prService,
      ghClient,
      eventLog,
      logger,
      githubOwner: 'acme',
      githubRepo: 'vibe',
      config: {
        enabled: true,
        reviewers: { default: ['infra-reviewer'], major: ['architect-reviewer'], minor: [], patch: [] },
      },
    });

    await bot.handleAfterToolCall(
      createEvent({ result: { details: { number: 77, cached: true } } }),
      createContext(),
    );

    expect(labelService.syncLabels).not.toHaveBeenCalled();
    expect(prService.updateTaskPr).not.toHaveBeenCalled();
    expect(ghClient.requestReviewers).not.toHaveBeenCalled();
    expect(ghClient.commentPr).not.toHaveBeenCalled();
    expect(eventLog.logVcsEvent).toHaveBeenCalledWith(
      'TASK-100',
      'vcs.pr.bot',
      'infra',
      expect.objectContaining({ skipped: true }),
    );
  });

  it('applies labels, assigns reviewers, and posts status comment', async () => {
    const bot = new PrBotAutomation({
      taskReader,
      labelService,
      prService,
      ghClient,
      eventLog,
      logger,
      githubOwner: 'acme',
      githubRepo: 'vibe',
      config: {
        enabled: true,
        reviewers: { default: ['infra-reviewer'], major: ['architect-reviewer'], minor: [], patch: [] },
      },
    });

    await bot.handleAfterToolCall(createEvent(), createContext());

    expect(labelService.syncLabels).toHaveBeenCalledWith({
      taskId: 'TASK-100',
      labels: expect.arrayContaining([
        expect.objectContaining({ name: 'scope:major' }),
        expect.objectContaining({ name: 'epic:ep04' }),
        expect.objectContaining({ name: 'area:vcs' }),
      ]),
    });

    expect(prService.updateTaskPr).toHaveBeenCalledWith({
      taskId: 'TASK-100',
      prNumber: 77,
      labels: ['area:vcs', 'epic:ep04', 'scope:major'],
    });

    expect(ghClient.requestReviewers).toHaveBeenCalledWith(
      77,
      ['architect-reviewer', 'infra-reviewer'],
    );

    expect(ghClient.commentPr).toHaveBeenCalledWith(
      77,
      expect.stringContaining('### Checklist'),
    );
    expect(ghClient.commentPr).toHaveBeenCalledWith(
      77,
      expect.stringContaining('Task: [TASK-100]('),
    );

    expect(eventLog.logVcsEvent).toHaveBeenCalledWith(
      'TASK-100',
      'vcs.pr.bot',
      'infra',
      expect.objectContaining({
        labelsApplied: ['area:vcs', 'epic:ep04', 'scope:major'],
        reviewersAssigned: ['architect-reviewer', 'infra-reviewer'],
        commentPosted: true,
      }),
    );
  });

  it('continues execution when reviewer assignment fails', async () => {
    ghClient.requestReviewers.mockRejectedValueOnce(new Error('cannot assign reviewers'));
    const bot = new PrBotAutomation({
      taskReader,
      labelService,
      prService,
      ghClient,
      eventLog,
      logger,
      githubOwner: 'acme',
      githubRepo: 'vibe',
      config: {
        enabled: true,
        reviewers: { default: ['infra-reviewer'], major: [], minor: [], patch: [] },
      },
    });

    await bot.handleAfterToolCall(createEvent(), createContext());

    expect(ghClient.commentPr).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('reviewers: Error: cannot assign reviewers'),
    );
    expect(eventLog.logVcsEvent).toHaveBeenCalledWith(
      'TASK-100',
      'vcs.pr.bot',
      'infra',
      expect.objectContaining({
        commentPosted: true,
        failures: expect.arrayContaining([
          expect.stringContaining('reviewers: Error: cannot assign reviewers'),
        ]),
      }),
    );
  });
});
