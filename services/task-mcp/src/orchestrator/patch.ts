import { TaskRecord } from '../domain/TaskRecord.js';

export function mergeTaskWithPatch(task: TaskRecord, patch: Partial<TaskRecord>): TaskRecord {
  const candidate: TaskRecord = {
    ...task,
    ...patch,
    status: (patch.status ?? task.status) as TaskRecord['status']
  };

  if (task.metrics || patch.metrics) {
    candidate.metrics = {
      ...(task.metrics ?? {}),
      ...(patch.metrics ?? {}),
      lint: patch.metrics?.lint
        ? { ...(task.metrics?.lint ?? {}), ...patch.metrics.lint }
        : task.metrics?.lint
    };
  }

  if (task.qa_report || patch.qa_report) {
    candidate.qa_report = { ...(task.qa_report ?? {}), ...(patch.qa_report ?? {}) };
  }

  if (patch.review_notes) {
    candidate.review_notes = [...patch.review_notes];
  } else if (task.review_notes) {
    candidate.review_notes = [...task.review_notes];
  }

  if (patch.red_green_refactor_log) {
    candidate.red_green_refactor_log = [...patch.red_green_refactor_log];
  } else if (task.red_green_refactor_log) {
    candidate.red_green_refactor_log = [...task.red_green_refactor_log];
  }

  if (task.links || patch.links) {
    candidate.links = {
      ...(task.links ?? {}),
      ...(patch.links ?? {}),
      github: patch.links?.github
        ? { ...(task.links?.github ?? {}), ...patch.links.github }
        : task.links?.github,
      git: patch.links?.git ? { ...(task.links?.git ?? {}), ...patch.links.git } : task.links?.git
    };
  }

  if (patch.tags) {
    candidate.tags = [...patch.tags];
  } else if (task.tags) {
    candidate.tags = [...task.tags];
  }

  return candidate;
}
