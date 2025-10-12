import { TaskRecord } from '../domain/TaskRecord.js';

export function rowToRecord(row: any): TaskRecord {
  return {
    version: row.version,
    id: row.id,
    title: row.title,
    description: row.description,
    acceptance_criteria: JSON.parse(row.acceptance_json),
    scope: row.scope,
    modules: JSON.parse(row.modules_json),
    contracts: JSON.parse(row.contracts_json),
    patterns: JSON.parse(row.patterns_json),
    adr_id: row.adr_id,
    test_plan: JSON.parse(row.test_plan_json),
    branch: row.branch,
    diff_summary: row.diff_summary,
    review_notes: JSON.parse(row.review_notes_json),
    qa_report: JSON.parse(row.qa_report_json),
    metrics: {
      coverage: row.coverage,
      complexity: JSON.parse(row.metrics_json).complexity,
      lint: { errors: row.lint_errors, warnings: row.lint_warnings }
    },
    red_green_refactor_log: JSON.parse(row.red_green_refactor_json),
    status: row.status,
    rounds_review: row.rounds_review,
    links: JSON.parse(row.links_json),
    tags: JSON.parse(row.tags_json),
    rev: row.rev,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function recordToParams(record: Omit<TaskRecord, 'rev' | 'created_at' | 'updated_at'>): any[] {
  const serialized = serializeRecordFields(record);

  return [
    record.id, record.title, record.description || null, record.scope, record.status,
    record.adr_id || null, record.branch || null,
    serialized.coverage, serialized.lintErrors, serialized.lintWarnings,
    serialized.roundsReview,
    serialized.metricsJson, serialized.qaReportJson,
    serialized.acceptanceJson, serialized.modulesJson,
    serialized.contractsJson, serialized.patternsJson,
    serialized.reviewNotesJson, serialized.testPlanJson,
    serialized.tagsJson, serialized.linksJson,
    record.diff_summary || null, serialized.redGreenRefactorJson
  ];
}

function serializeRecordFields(record: Omit<TaskRecord, 'rev' | 'created_at' | 'updated_at'>) {
  const primitives = serializePrimitiveFields(record);

  const serialized = serializeJsonFields(record);

  return {
    ...primitives,
    ...serialized
  };
}

function serializePrimitiveFields(record: Omit<TaskRecord, 'rev' | 'created_at' | 'updated_at'>) {
  const coverage = record.metrics?.coverage || 0;
  const lintErrors = record.metrics?.lint?.errors || 0;
  const lintWarnings = record.metrics?.lint?.warnings || 0;
  const roundsReview = record.rounds_review || 0;

  return {
    coverage,
    lintErrors,
    lintWarnings,
    roundsReview
  };
}

function serializeJsonFields(record: Omit<TaskRecord, 'rev' | 'created_at' | 'updated_at'>) {
  const coreFields = {
    metricsJson: JSON.stringify(record.metrics || {}),
    qaReportJson: JSON.stringify(record.qa_report || {}),
    acceptanceJson: JSON.stringify(record.acceptance_criteria),
    modulesJson: JSON.stringify(record.modules || []),
    contractsJson: JSON.stringify(record.contracts || []),
    patternsJson: JSON.stringify(record.patterns || [])
  };

  const workflowFields = {
    reviewNotesJson: JSON.stringify(record.review_notes || []),
    testPlanJson: JSON.stringify(record.test_plan || []),
    tagsJson: JSON.stringify(record.tags || []),
    linksJson: JSON.stringify(record.links || {}),
    redGreenRefactorJson: JSON.stringify(record.red_green_refactor_log || [])
  };

  return { ...coreFields, ...workflowFields };
}

export function updatedRecordToParams(updated: TaskRecord): any[] {
  return [
    updated.title, updated.description, updated.scope, updated.status, updated.adr_id, updated.branch,
    updated.metrics?.coverage, updated.metrics?.lint?.errors, updated.metrics?.lint?.warnings,
    updated.rounds_review, JSON.stringify(updated.metrics), JSON.stringify(updated.qa_report),
    JSON.stringify(updated.acceptance_criteria), JSON.stringify(updated.modules),
    JSON.stringify(updated.contracts), JSON.stringify(updated.patterns),
    JSON.stringify(updated.review_notes), JSON.stringify(updated.test_plan),
    JSON.stringify(updated.tags), JSON.stringify(updated.links), updated.diff_summary,
    JSON.stringify(updated.red_green_refactor_log), updated.rev, updated.updated_at, updated.id
  ];
}