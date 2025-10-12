export const REASON_MESSAGES: Record<string, string> = {
  scope_minor: 'Scope minor',
  diff_small: 'Diff <= 60 LOC',
  diff_medium: 'Diff <= 120 LOC',
  tests_docs_only: 'Only tests or documentation changed',
  coverage_strong: 'Coverage >= 85%',
  coverage_ok: 'Coverage >= 75%',
  complexity_ok: 'Cyclomatic complexity <= 5',
  lint_clean: 'Lint errors = 0',
  module_boundary_safe: 'Module boundaries unchanged',
  public_api_stable: 'Public API unchanged',
  no_code_changes: 'No code changes detected',
  eligible: 'Meets all criteria',
  score_below_threshold: 'Score below threshold'
};

export const HARD_BLOCK_MESSAGES: Record<string, string> = {
  public_api: 'Public API changed',
  modules_changed: 'Module boundaries changed',
  contracts_changed: 'Contracts changed',
  patterns_changed: 'Patterns changed',
  adr_changed: 'ADR changes detected',
  sensitive_path: 'Changes in sensitive paths (security/auth/payments/infra/migrations)',
  schema_change: 'Schema changes detected',
  lint_errors: 'Lint errors present'
};

export const REVOCATION_MESSAGES: Record<string, string> = {
  public_api: 'Public API changed after development',
  modules_changed: 'Module boundaries changed after development',
  contracts_changed: 'Contracts changed after development',
  patterns_changed: 'Patterns changed after development',
  adr_changed: 'ADR changes detected',
  sensitive_path: 'Changes in sensitive paths detected after development',
  schema_change: 'Schema changes detected after development',
  lint_errors: 'Lint errors introduced during development',
  coverage_below_threshold: 'Coverage dropped below required threshold',
  high_violations: 'High-severity review violations detected',
  score_below_threshold: 'Fast-track score dropped below threshold'
};

export function formatReason(reason: string): string {
  return REASON_MESSAGES[reason] ?? reason;
}

export function formatHardBlock(code: string): string {
  return HARD_BLOCK_MESSAGES[code] ?? code;
}

export function formatRevocationReason(reason: string): string {
  return REVOCATION_MESSAGES[reason] ?? reason;
}