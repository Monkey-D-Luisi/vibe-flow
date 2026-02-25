function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

function mergeRoot(
  currentMetadata: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const next = asRecord(currentMetadata);
  next[key] = value;
  return next;
}

export function mergeQualityBranch(
  currentMetadata: Record<string, unknown>,
  key: 'tests' | 'coverage' | 'lint' | 'complexity' | 'gate',
  value: unknown,
): Record<string, unknown> {
  const next = asRecord(currentMetadata);
  const quality = asRecord(next.quality);
  quality[key] = value;
  next.quality = quality;
  return next;
}

export function mergeQaReport(
  currentMetadata: Record<string, unknown>,
  qaReport: Record<string, unknown>,
  qualityTestsResult: Record<string, unknown>,
): Record<string, unknown> {
  const next = mergeRoot(currentMetadata, 'qa_report', qaReport);
  return mergeQualityBranch(next, 'tests', qualityTestsResult);
}

export function mergeCoverageMetrics(
  currentMetadata: Record<string, unknown>,
  coveragePct: number,
  qualityCoverageResult: Record<string, unknown>,
): Record<string, unknown> {
  const next = asRecord(currentMetadata);
  const devResult = asRecord(next.dev_result);
  const metrics = asRecord(devResult.metrics);
  metrics.coverage = coveragePct;
  devResult.metrics = metrics;
  next.dev_result = devResult;
  return mergeQualityBranch(next, 'coverage', qualityCoverageResult);
}

export function mergeLintMetrics(
  currentMetadata: Record<string, unknown>,
  lintClean: boolean,
  qualityLintResult: Record<string, unknown>,
): Record<string, unknown> {
  const next = asRecord(currentMetadata);
  const devResult = asRecord(next.dev_result);
  const metrics = asRecord(devResult.metrics);
  metrics.lint_clean = lintClean;
  devResult.metrics = metrics;
  next.dev_result = devResult;
  return mergeQualityBranch(next, 'lint', qualityLintResult);
}

export function mergeComplexityMetrics(
  currentMetadata: Record<string, unknown>,
  complexityResult: Record<string, unknown>,
): Record<string, unknown> {
  const next = asRecord(currentMetadata);
  const files = Array.isArray(complexityResult.files)
    ? complexityResult.files
    : [];
  next.complexity = {
    avg: complexityResult.avgCyclomatic,
    max: complexityResult.maxCyclomatic,
    files: files.length,
  };
  return mergeQualityBranch(next, 'complexity', complexityResult);
}

export function mergeQualityGateResult(
  currentMetadata: Record<string, unknown>,
  gateResult: Record<string, unknown>,
): Record<string, unknown> {
  return mergeQualityBranch(currentMetadata, 'gate', gateResult);
}
