import type { NormalizedLintFileReport, NormalizedLintMessage, LintSeverity } from './types.js';

/**
 * Raw ESLint JSON output shape (per-file).
 */
interface EslintRawMessage {
  ruleId: string | null;
  severity: number; // 1 = warning, 2 = error
  message: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

interface EslintRawFileResult {
  filePath: string;
  errorCount: number;
  warningCount: number;
  messages: EslintRawMessage[];
}

function mapSeverity(severity: number): LintSeverity {
  switch (severity) {
    case 2:
      return 'error';
    case 1:
      return 'warning';
    default:
      return 'info';
  }
}

function normalizeMessage(raw: EslintRawMessage): NormalizedLintMessage {
  return {
    ruleId: raw.ruleId,
    severity: mapSeverity(raw.severity),
    message: raw.message,
    line: raw.line,
    column: raw.column,
    endLine: raw.endLine,
    endColumn: raw.endColumn,
  };
}

/**
 * Parse ESLint JSON output into normalized lint reports.
 */
export function parseEslintOutput(jsonString: string): NormalizedLintFileReport[] {
  let raw: EslintRawFileResult[];
  try {
    raw = JSON.parse(jsonString) as EslintRawFileResult[];
  } catch {
    throw new Error('PARSE_ERROR: Failed to parse ESLint JSON output');
  }

  if (!Array.isArray(raw)) {
    throw new Error('PARSE_ERROR: ESLint output is not an array');
  }

  return raw.map((file) => ({
    file: file.filePath,
    errors: file.errorCount,
    warnings: file.warningCount,
    messages: file.messages.map(normalizeMessage),
  }));
}

/**
 * Summarize ESLint results.
 */
export function summarizeEslint(reports: NormalizedLintFileReport[]): {
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
