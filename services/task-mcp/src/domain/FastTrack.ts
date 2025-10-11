import { TaskRecord } from './TaskRecord.js';

export interface FastTrackContext {
  task: TaskRecord;
  diff: {
    files: string[];
    locAdded: number;
    locDeleted: number;
  };
  quality: {
    coverage?: number;
    avgCyclomatic?: number;
    lintErrors: number;
  };
  metadata: {
    modulesChanged: boolean;
    publicApiChanged: boolean;
    contractsChanged?: boolean;
    patternsChanged?: boolean;
    adrChanged?: boolean;
    packagesSchemaChanged?: boolean;
  };
}

export interface FastTrackResult {
  eligible: boolean;
  score: number;
  reasons: string[];
  hardBlocks: string[];
}

export interface PostDevGuardResult {
  revoke: boolean;
  reason?: string;
}

const SENSITIVE_PATHS = /^(security|auth|payments|infra|migrations)\//;
const TEST_OR_DOC_FILE = /(test|spec)\.[tj]s$/i;
const DOC_EXT = /\.(md|rst|adoc)$/i;

export function evaluateFastTrack(ctx: FastTrackContext): FastTrackResult {
  const hardBlocks: string[] = [];
  const reasons: string[] = [];
  const { diff, quality, metadata, task } = ctx;

  const touchesSensitivePath = diff.files.some(file => SENSITIVE_PATHS.test(file));
  const touchesSchemas = diff.files.some(file => file.startsWith('packages/schemas/'));

  const registerHardBlock = (code: string, condition: boolean) => {
    if (condition) {
      hardBlocks.push(code);
    }
  };

  registerHardBlock('public_api', metadata.publicApiChanged);
  registerHardBlock('modules_changed', metadata.modulesChanged);
  registerHardBlock('contracts_changed', Boolean(metadata.contractsChanged));
  registerHardBlock('patterns_changed', Boolean(metadata.patternsChanged));
  registerHardBlock('adr_changed', Boolean(metadata.adrChanged));
  registerHardBlock('sensitive_path', touchesSensitivePath);
  registerHardBlock('schema_change', metadata.packagesSchemaChanged ?? touchesSchemas);
  registerHardBlock('lint_errors', (quality.lintErrors ?? 0) > 0);

  let score = 0;

  if (task.scope === 'minor') {
    score += 40;
    reasons.push('scope_minor');
  }

  const totalLoc = diff.locAdded + diff.locDeleted;
  if (totalLoc === 0) {
    score += 10;
    reasons.push('no_code_changes');
  } else if (totalLoc <= 60) {
    score += 15;
    reasons.push('diff_small');
  } else if (totalLoc <= 120) {
    score += 10;
    reasons.push('diff_medium');
  }

  const onlyTestsOrDocs = diff.files.length > 0 && diff.files.every(file => TEST_OR_DOC_FILE.test(file) || DOC_EXT.test(file));
  if (onlyTestsOrDocs) {
    score += 15;
    reasons.push('tests_docs_only');
  }

  const coverage = quality.coverage ?? 0;
  if (coverage >= 0.85) {
    score += 10;
    reasons.push('coverage_strong');
  } else if (coverage >= 0.75) {
    score += 5;
    reasons.push('coverage_ok');
  }

  if ((quality.avgCyclomatic ?? Number.POSITIVE_INFINITY) <= 5) {
    score += 5;
    reasons.push('complexity_ok');
  }

  if (quality.lintErrors === 0) {
    score += 5;
    reasons.push('lint_clean');
  }

  if (!metadata.modulesChanged) {
    score += 5;
    reasons.push('module_boundary_safe');
  }

  if (!metadata.publicApiChanged) {
    score += 5;
    reasons.push('public_api_stable');
  }

  score = Math.max(0, Math.min(100, score));

  const eligible = hardBlocks.length === 0 && score >= 60;
  if (!eligible && hardBlocks.length === 0) {
    reasons.push('score_below_threshold');
  }
  if (eligible) {
    reasons.push('eligible');
  }

  return { eligible, score, reasons, hardBlocks };
}

export function guardPostDev(ctx: FastTrackContext, reviewerViolations?: Array<{ severity: string }>): PostDevGuardResult {
  const coverageThreshold = ctx.task.scope === 'major' ? 0.8 : 0.7;
  if ((ctx.quality.coverage ?? 0) < coverageThreshold) {
    return { revoke: true, reason: 'coverage_below_threshold' };
  }

  if ((ctx.quality.lintErrors ?? 0) > 0) {
    return { revoke: true, reason: 'lint_errors' };
  }

  const evaluation = evaluateFastTrack(ctx);
  if (!evaluation.eligible) {
    const reason = evaluation.hardBlocks[0] ?? 'score_below_threshold';
    return { revoke: true, reason };
  }

  if (reviewerViolations?.some(v => v.severity === 'high')) {
    return { revoke: true, reason: 'high_violations' };
  }

  return { revoke: false };
}
