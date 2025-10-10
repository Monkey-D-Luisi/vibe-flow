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

/**
 * Evalúa si un task es elegible para fast-track (PO → DEV omitiendo Arquitectura)
 * Basado en reglas duras y scoring objetivo según EP01-T05
 */
export function evaluateFastTrack(ctx: FastTrackContext): FastTrackResult {
  const { task, diff, quality, metadata } = ctx;
  const hardBlocks: string[] = [];
  const reasons: string[] = [];

  // Función helper para verificar si toca rutas sensibles
  const touches = (pattern: RegExp) => diff.files.some(f => pattern.test(f));

  // REGLAS DURAS (cualquier violación desactiva fast-track)
  if (metadata.publicApiChanged) {
    hardBlocks.push('public_api');
  }
  if (metadata.modulesChanged) {
    hardBlocks.push('modules_changed');
  }
  if (touches(/^(security|auth|payments|infra|migrations)\//)) {
    hardBlocks.push('sensitive_path');
  }
  if (touches(/^packages\/schemas\//)) {
    hardBlocks.push('schema_change');
  }
  if (task.contracts && task.contracts.length > 0) {
    hardBlocks.push('contracts_touched');
  }
  if (task.adr_id) {
    hardBlocks.push('adr_required');
  }
  if (quality.lintErrors > 0) {
    hardBlocks.push('lint_errors');
  }

  // SCORING OBJETIVO (0-100)
  let score = task.scope === 'minor' ? 40 : 0;

  // Señales positivas
  const totalLOC = diff.locAdded + diff.locDeleted;
  if (diff.files.every(f => /\b(test|spec|docs?)\b/.test(f) || /\.(md|rst|adoc)$/.test(f))) {
    score += 20;
    reasons.push('only_tests_docs');
  }

  if (totalLOC <= 60) {
    score += 15;
    reasons.push('diff_small');
  } else if (totalLOC <= 120) {
    score += 10;
    reasons.push('diff_medium');
  }

  if ((quality.avgCyclomatic ?? 0) <= 5) {
    score += 10;
    reasons.push('complexity_ok');
  }

  if (!metadata.modulesChanged) {
    score += 5;
    reasons.push('no_modules_changed');
  }

  // Señales negativas (ya manejadas en hardBlocks, pero afectan score)
  if (metadata.publicApiChanged) score -= 20;
  if (metadata.modulesChanged) score -= 60;
  if (touches(/^(security|auth|payments|infra|migrations)\//)) score -= 40;
  if (touches(/^packages\/schemas\//)) score -= 25;
  if (task.contracts?.length) score -= 60;
  if (task.adr_id) score -= 60;

  // Umbral final
  const eligible = hardBlocks.length === 0 && score >= 60;

  if (task.scope === 'minor') reasons.push('scope_minor');
  if (eligible) reasons.push('eligible');

  return { eligible, score, reasons, hardBlocks };
}

/**
 * Reevalúa después de DEV para verificar si el fast-track debe revocarse
 */
export function guardPostDev(ctx: FastTrackContext, reviewerViolations?: any[]): PostDevGuardResult {
  // Verificar quality gates primero
  const coverageThreshold = ctx.task.scope === 'major' ? 0.8 : 0.7;
  if ((ctx.quality.coverage ?? 0) < coverageThreshold) {
    return { revoke: true, reason: 'coverage_below_threshold' };
  }

  const evaluation = evaluateFastTrack(ctx);

  // Si ya no es elegible, revocar
  if (!evaluation.eligible) {
    const reason = evaluation.hardBlocks.length > 0 ? evaluation.hardBlocks[0] : 'score_below_threshold';
    return { revoke: true, reason };
  }

  // Verificar violaciones del reviewer
  if (reviewerViolations) {
    const highViolations = reviewerViolations.filter(v => v.severity === 'high');
    if (highViolations.length > 0) {
      return { revoke: true, reason: 'high_violations' };
    }
  }

  return { revoke: false };
}