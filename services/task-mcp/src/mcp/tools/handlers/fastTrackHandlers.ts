import { evaluateFastTrack, guardPostDev, type FastTrackContext } from '../../../domain/FastTrack.js';
import { repo, stateRepo, eventRepo } from './sharedRepos.js';

class SemanticError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
    this.name = 'SemanticError';
  }
}

export async function handleFastTrackEvaluate(input: unknown): Promise<any> {
  const args = input as {
    task_id: string;
    diff: any;
    quality: any;
    metadata: any;
  };

  const task = repo.get(args.task_id);
  if (!task) {
    throw new SemanticError(404, 'Task not found');
  }

  const context: FastTrackContext = {
    task,
    diff: args.diff,
    quality: args.quality,
    metadata: args.metadata
  };

  const result = evaluateFastTrack(context);
  const tags = new Set(task.tags ?? []);
  tags.add('fast-track');
  tags.delete('fast-track:revoked');

  if (result.eligible) {
    tags.add('fast-track:eligible');
    tags.delete('fast-track:blocked');
  } else {
    tags.add('fast-track:blocked');
    tags.delete('fast-track:eligible');
  }

  const updated = repo.update(task.id, task.rev, { tags: Array.from(tags) });
  eventRepo.append(task.id, 'fasttrack', {
    action: 'evaluated',
    eligible: result.eligible,
    score: result.score,
    reasons: result.reasons,
    hardBlocks: result.hardBlocks
  });

  return { result, task: updated };
}

export async function handleFastTrackGuardPostDev(input: unknown): Promise<any> {
  const args = input as {
    task_id: string;
    diff: any;
    quality: any;
    metadata: any;
    reviewer_violations?: any[];
  };

  const task = repo.get(args.task_id);
  if (!task) {
    throw new SemanticError(404, 'Task not found');
  }

  const state = stateRepo.get(args.task_id);
  if (!state) {
    throw new SemanticError(404, 'State not found');
  }

  const context: FastTrackContext = {
    task,
    diff: args.diff,
    quality: args.quality,
    metadata: args.metadata
  };

  const result = guardPostDev(context, args.reviewer_violations);

  if (result.revoke) {
    const tags = new Set(task.tags ?? []);
    tags.add('fast-track:revoked');
    const updated = repo.update(task.id, task.rev, { tags: Array.from(tags), status: 'arch' });
    eventRepo.append(task.id, 'fasttrack', { action: 'revoked', reason: result.reason });

    try {
      stateRepo.update(args.task_id, state.rev, {
        current: 'arch',
        previous: state.current
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Optimistic lock failed') {
        throw new SemanticError(409, 'Optimistic lock failed');
      }
      if (error instanceof Error && error.message === 'State not found') {
        throw new SemanticError(404, 'State not found');
      }
      throw error;
    }

    return { result, task: updated };
  }

  return { result, task };
}
