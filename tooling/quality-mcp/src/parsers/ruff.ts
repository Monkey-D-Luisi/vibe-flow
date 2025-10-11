import type { NormalizedLintFileReport, NormalizedLintMessage, LintSeverity } from './types.js';

interface RuffLocation {
  row?: number;
  column?: number;
}

interface RuffMessage {
  code?: string;
  message?: string;
  filename?: string;
  location?: RuffLocation;
  end_location?: RuffLocation;
}

function mapSeverity(code: string | undefined): LintSeverity {
  if (!code || typeof code !== 'string' || code.length === 0) {
    return 'info';
  }
  const prefix = code[0]?.toUpperCase();
  if (prefix === 'E' || prefix === 'F') {
    return 'error';
  }
  if (prefix === 'W') {
    return 'warning';
  }
  return 'info';
}

function normalizePosition(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  const truncated = Math.floor(value);
  return truncated >= 0 ? truncated : undefined;
}

function normalizeMessage(entry: RuffMessage): NormalizedLintMessage {
  const severity = mapSeverity(entry.code);
  const normalized: NormalizedLintMessage = {
    ruleId: typeof entry.code === 'string' ? entry.code : null,
    severity,
    message: entry.message ?? ''
  };

  const line = normalizePosition(entry.location?.row);
  if (line !== undefined) {
    normalized.line = line;
  }
  const column = normalizePosition(entry.location?.column);
  if (column !== undefined) {
    normalized.column = column;
  }
  const endLine = normalizePosition(entry.end_location?.row);
  if (endLine !== undefined) {
    normalized.endLine = endLine;
  }
  const endColumn = normalizePosition(entry.end_location?.column);
  if (endColumn !== undefined) {
    normalized.endColumn = endColumn;
  }

  return normalized;
}

/**
 * Parse Ruff JSON output into normalized lint report.
 */
export function parseRuffJson(json: string): NormalizedLintFileReport[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('PARSE_ERROR: Invalid JSON from Ruff');
  }

  if (!Array.isArray(raw)) {
    throw new Error('PARSE_ERROR: Ruff output must be an array');
  }

  const grouped = new Map<string, NormalizedLintFileReport>();

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('PARSE_ERROR: Ruff result entry must be an object');
    }
    const { filename } = entry as RuffMessage;
    if (typeof filename !== 'string' || filename.length === 0) {
      throw new Error('PARSE_ERROR: Ruff result missing filename');
    }

    const normalizedMessage = normalizeMessage(entry as RuffMessage);
    let report = grouped.get(filename);
    if (!report) {
      report = { file: filename, errors: 0, warnings: 0, messages: [] };
      grouped.set(filename, report);
    }
    report.messages.push(normalizedMessage);
    if (normalizedMessage.severity === 'error') {
      report.errors += 1;
    } else if (normalizedMessage.severity === 'warning') {
      report.warnings += 1;
    }
  }

  return Array.from(grouped.values());
}
