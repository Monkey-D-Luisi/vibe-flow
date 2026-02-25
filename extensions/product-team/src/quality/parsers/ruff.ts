import type { NormalizedLintFileReport, NormalizedLintMessage, LintSeverity } from './types.js';

/**
 * Raw Ruff JSON output shape.
 */
interface RuffRawDiagnostic {
  code: string;
  message: string;
  filename: string;
  location: {
    row: number;
    column: number;
  };
  end_location: {
    row: number;
    column: number;
  };
  fix?: {
    applicability: string;
    message: string;
  } | null;
  noqa_row?: number;
}

function mapRuffSeverity(code: string): LintSeverity {
  // Ruff error codes: E = pycodestyle errors, W = warnings, F = pyflakes, etc.
  if (code.startsWith('E') || code.startsWith('F')) {
    return 'error';
  }
  if (code.startsWith('W')) {
    return 'warning';
  }
  return 'info';
}

/**
 * Parse Ruff JSON output into normalized lint reports.
 */
export function parseRuffOutput(jsonString: string): NormalizedLintFileReport[] {
  let raw: RuffRawDiagnostic[];
  try {
    raw = JSON.parse(jsonString) as RuffRawDiagnostic[];
  } catch {
    throw new Error('PARSE_ERROR: Failed to parse Ruff JSON output');
  }

  if (!Array.isArray(raw)) {
    throw new Error('PARSE_ERROR: Ruff output is not an array');
  }

  // Group diagnostics by file
  const byFile = new Map<string, RuffRawDiagnostic[]>();
  for (const diag of raw) {
    const existing = byFile.get(diag.filename) || [];
    existing.push(diag);
    byFile.set(diag.filename, existing);
  }

  const reports: NormalizedLintFileReport[] = [];
  for (const [file, diagnostics] of byFile) {
    const messages: NormalizedLintMessage[] = diagnostics.map((d) => ({
      ruleId: d.code,
      severity: mapRuffSeverity(d.code),
      message: d.message,
      line: d.location.row,
      column: d.location.column,
      endLine: d.end_location.row,
      endColumn: d.end_location.column,
    }));

    const errors = messages.filter((m) => m.severity === 'error').length;
    const warnings = messages.filter((m) => m.severity === 'warning').length;

    reports.push({ file, errors, warnings, messages });
  }

  return reports;
}

/**
 * Summarize Ruff results.
 */
export function summarizeRuff(reports: NormalizedLintFileReport[]): {
  totalErrors: number;
  totalWarnings: number;
  filesWithIssues: number;
  totalFiles: number;
} {
  let totalErrors = 0;
  let totalWarnings = 0;
  let filesWithIssues = 0;

  for (const report of reports) {
    totalErrors += report.errors;
    totalWarnings += report.warnings;
    if (report.errors > 0 || report.warnings > 0) {
      filesWithIssues++;
    }
  }

  return {
    totalErrors,
    totalWarnings,
    filesWithIssues,
    totalFiles: reports.length,
  };
}
