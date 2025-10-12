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
  const { diff, quality, metadata } = ctx;

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

  const { score, reasons } = calculateFastTrackScore(ctx, hardBlocks);

  return { eligible: hardBlocks.length === 0 && score >= 60, score, reasons, hardBlocks };
}

function calculateFastTrackScore(ctx: FastTrackContext, hardBlocks: string[]): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const { diff, quality, metadata, task } = ctx;

  let score = 0;

  score += calculateScopeBonus(task.scope, reasons);
  score += calculateDiffBonus(diff, reasons);
  score += calculateFileTypeBonus(diff.files, reasons);
  score += calculateQualityBonuses(quality, reasons);
  score += calculateMetadataBonuses(metadata, reasons);

  score = Math.max(0, Math.min(100, score));

  addEligibilityReason(score, hardBlocks, reasons);

  return { score, reasons };
}

function calculateScopeBonus(scope: string, reasons: string[]): number {
  if (scope === 'minor') {
    reasons.push('scope_minor');
    return 40;
  }
  return 0;
}

function calculateDiffBonus(diff: FastTrackContext['diff'], reasons: string[]): number {
  const totalLoc = diff.locAdded + diff.locDeleted;
  if (totalLoc === 0) {
    reasons.push('no_code_changes');
    return 10;
  } else if (totalLoc <= 60) {
    reasons.push('diff_small');
    return 15;
  } else if (totalLoc <= 120) {
    reasons.push('diff_medium');
    return 10;
  }
  return 0;
}

function calculateFileTypeBonus(files: string[], reasons: string[]): number {
  const onlyTestsOrDocs = files.length > 0 && files.every(file => TEST_OR_DOC_FILE.test(file) || DOC_EXT.test(file));
  if (onlyTestsOrDocs) {
    reasons.push('tests_docs_only');
    return 15;
  }
  return 0;
}

function calculateQualityBonuses(quality: FastTrackContext['quality'], reasons: string[]): number {
  let bonus = 0;

  const coverage = quality.coverage ?? 0;
  if (coverage >= 0.85) {
    reasons.push('coverage_strong');
    bonus += 10;
  } else if (coverage >= 0.75) {
    reasons.push('coverage_ok');
    bonus += 5;
  }

  if ((quality.avgCyclomatic ?? Number.POSITIVE_INFINITY) <= 5) {
    reasons.push('complexity_ok');
    bonus += 5;
  }

  if (quality.lintErrors === 0) {
    reasons.push('lint_clean');
    bonus += 5;
  }

  return bonus;
}

function calculateMetadataBonuses(metadata: FastTrackContext['metadata'], reasons: string[]): number {
  let bonus = 0;

  if (!metadata.modulesChanged) {
    reasons.push('module_boundary_safe');
    bonus += 5;
  }

  if (!metadata.publicApiChanged) {
    reasons.push('public_api_stable');
    bonus += 5;
  }

  return bonus;
}

function addEligibilityReason(score: number, hardBlocks: string[], reasons: string[]): void {
  if (hardBlocks.length === 0) {
    if (score >= 60) {
      reasons.push('eligible');
    } else {
      reasons.push('score_below_threshold');
    }
  }
}

export function guardPostDev(
  ctx: FastTrackContext,
  reviewerViolations?: Array<{ severity: string; rule?: string }>
): PostDevGuardResult {
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
