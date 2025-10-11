import type { NormalizedLintFileReport, NormalizedLintMessage, LintSeverity } from './types.js';

interface ESLintMessage {
  ruleId: string | null;
  severity?: number;
  message: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

interface ESLintResult {
  filePath: string;
  messages: ESLintMessage[];
}

function mapSeverity(value: number | undefined): LintSeverity {
  switch (value) {
    case 2:
      return 'error';
    case 1:
      return 'warning';
    default:
      return 'info';
  }
}

function normalizePosition(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  const truncated = Math.floor(value);
  return truncated >= 0 ? truncated : undefined;
}

function normalizeMessage(message: ESLintMessage): NormalizedLintMessage {
  const severity = mapSeverity(message.severity);
  const normalized: NormalizedLintMessage = {
    ruleId: typeof message.ruleId === 'string' || message.ruleId === null ? message.ruleId : null,
    severity,
    message: message.message ?? ''
  };

  const line = normalizePosition(message.line);
  if (line !== undefined) {
    normalized.line = line;
  }
  const column = normalizePosition(message.column);
  if (column !== undefined) {
    normalized.column = column;
  }
  const endLine = normalizePosition(message.endLine);
  if (endLine !== undefined) {
    normalized.endLine = endLine;
  }
  const endColumn = normalizePosition(message.endColumn);
  if (endColumn !== undefined) {
    normalized.endColumn = endColumn;
  }

  return normalized;
}

/**
 * Parse ESLint JSON output into normalized lint report.
 */
export function parseEslintJson(json: string): NormalizedLintFileReport[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    throw new Error('PARSE_ERROR: Invalid JSON from ESLint');
  }

  if (!Array.isArray(raw)) {
    throw new Error('PARSE_ERROR: ESLint output must be an array');
  }

  const results: NormalizedLintFileReport[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('PARSE_ERROR: ESLint result entry must be an object');
    }

    const { filePath, messages } = entry as Partial<ESLintResult>;

    if (typeof filePath !== 'string') {
      throw new Error('PARSE_ERROR: ESLint result missing filePath');
    }

    if (!Array.isArray(messages)) {
      throw new Error(`PARSE_ERROR: ESLint result for ${filePath} missing messages array`);
    }

    const normalizedMessages = messages.map((message) => normalizeMessage(message as ESLintMessage));
    let errors = 0;
    let warnings = 0;
    for (const message of normalizedMessages) {
      if (message.severity === 'error') {
        errors += 1;
      } else if (message.severity === 'warning') {
        warnings += 1;
      }
    }

    results.push({
      file: filePath,
      errors,
      warnings,
      messages: normalizedMessages
    });
  }

  return results;
}
