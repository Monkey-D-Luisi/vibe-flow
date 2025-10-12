import { TaskRecord } from '../domain/TaskRecord.js';

function mergeMetrics(taskMetrics?: TaskRecord['metrics'], patchMetrics?: TaskRecord['metrics']): TaskRecord['metrics'] | undefined {
  if (!taskMetrics && !patchMetrics) return undefined;
  return {
    ...(taskMetrics ?? {}),
    ...(patchMetrics ?? {}),
    lint: patchMetrics?.lint
      ? { ...(taskMetrics?.lint ?? {}), ...patchMetrics.lint }
      : taskMetrics?.lint
  };
}

function mergeQaReport(taskQa?: TaskRecord['qa_report'], patchQa?: TaskRecord['qa_report']): TaskRecord['qa_report'] | undefined {
  if (!taskQa && !patchQa) return undefined;
  return { ...(taskQa ?? {}), ...(patchQa ?? {}) };
}

function mergeArray<T>(taskArray?: T[], patchArray?: T[]): T[] | undefined {
  if (patchArray) return [...patchArray];
  if (taskArray) return [...taskArray];
  return undefined;
}

function mergeLinks(taskLinks?: TaskRecord['links'], patchLinks?: TaskRecord['links']): TaskRecord['links'] | undefined {
  if (!taskLinks && !patchLinks) return undefined;
  return {
    ...(taskLinks ?? {}),
    ...(patchLinks ?? {}),
    github: patchLinks?.github
      ? { ...(taskLinks?.github ?? {}), ...patchLinks.github }
      : taskLinks?.github,
    git: patchLinks?.git ? { ...(taskLinks?.git ?? {}), ...patchLinks.git } : taskLinks?.git
  };
}

export function mergeTaskWithPatch(task: TaskRecord, patch: Partial<TaskRecord>): TaskRecord {
  const candidate: TaskRecord = {
    ...task,
    ...patch,
    status: (patch.status ?? task.status) as TaskRecord['status']
  };

  candidate.metrics = mergeMetrics(task.metrics, patch.metrics);
  candidate.qa_report = mergeQaReport(task.qa_report, patch.qa_report);
  candidate.review_notes = mergeArray(task.review_notes, patch.review_notes);
  candidate.red_green_refactor_log = mergeArray(task.red_green_refactor_log, patch.red_green_refactor_log);
  candidate.links = mergeLinks(task.links, patch.links);
  candidate.tags = mergeArray(task.tags, patch.tags);

  return candidate;
}
