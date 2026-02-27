/**
 * Pure parsing and validation functions for the security vulnerability exception ledger.
 * Extracted for testability from enforce-ci-vulnerability-policy.ts.
 */

export interface LedgerException {
  readonly entry: string;
  readonly advisory: string;
  readonly packageName: string;
  readonly installedVersion: string;
  readonly dependencyPath: string;
  readonly status: string;
  readonly expiresRaw: string;
  readonly expiresDate: Date;
}

export const ACTIVE_EXCEPTION_STATUS = 'ACTIVE_EXCEPTION';
export const PNPM_WORKSPACE_PREFIX = 'extensions__product-team>';

export function normalizeDependencyPath(pathValue: string): string {
  const sanitized = stripCodeFences(pathValue.trim().replace(/\\/g, '/'));
  if (sanitized.startsWith(PNPM_WORKSPACE_PREFIX)) {
    return sanitized.slice(PNPM_WORKSPACE_PREFIX.length);
  }
  return sanitized;
}

export function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('`') && trimmed.endsWith('`') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function extractGhsaIdentifier(value: string): string | null {
  const match = value.match(/GHSA-[\w-]+/i);
  if (!match) {
    return null;
  }
  return match[0].toUpperCase();
}

export function parseMarkdownTableRow(row: string): string[] {
  return row
    .split('|')
    .slice(1, -1)
    .map((column) => column.trim());
}

export function parseIsoDate(rawValue: string): Date {
  const value = rawValue.trim();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid exception expiry date "${rawValue}" in vulnerability ledger.`);
  }
  return parsed;
}

export function buildMatchKey(
  advisory: string,
  packageName: string,
  installedVersion: string,
  dependencyPath: string,
): string {
  return [
    advisory.toUpperCase(),
    packageName,
    installedVersion,
    normalizeDependencyPath(dependencyPath),
  ].join('|');
}

export function parseLedgerExceptions(markdown: string): LedgerException[] {
  const lines = markdown.split(/\r?\n/);
  const sectionStart = lines.findIndex((line) =>
    line.trim().startsWith('## Active Exceptions'),
  );
  if (sectionStart === -1) {
    throw new Error('Could not find "Active Exceptions" section in vulnerability ledger.');
  }

  const rows: string[] = [];
  for (let i = sectionStart + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith('## ')) {
      break;
    }
    if (line.startsWith('|')) {
      rows.push(line);
    }
  }

  const headerRow = rows.find((row) => !row.includes('---'));
  if (!headerRow) {
    throw new Error('Could not parse vulnerability ledger table header.');
  }
  const expectedLedgerColumns = parseMarkdownTableRow(headerRow).length;

  const entries: LedgerException[] = [];
  for (const row of rows) {
    if (row.includes('---')) {
      continue;
    }

    const columns = parseMarkdownTableRow(row);
    if (columns.length !== expectedLedgerColumns) {
      throw new Error(
        `Unexpected vulnerability ledger row shape. Expected ${expectedLedgerColumns} columns, got ${columns.length}. Row: ${row}`,
      );
    }
    if (columns[0] === 'Entry') {
      continue;
    }

    const entry = columns[0];
    const advisory = extractGhsaIdentifier(columns[1]);
    if (!advisory) {
      throw new Error(`Missing GHSA identifier for ledger entry "${entry}".`);
    }

    const expiresRaw = columns[10];
    entries.push({
      entry,
      advisory,
      packageName: stripCodeFences(columns[2]),
      installedVersion: stripCodeFences(columns[3]),
      dependencyPath: stripCodeFences(columns[6]),
      status: columns[8],
      expiresRaw,
      expiresDate: parseIsoDate(expiresRaw),
    });
  }

  if (entries.length === 0) {
    throw new Error('No exception rows were parsed from the vulnerability ledger.');
  }

  return entries;
}

/**
 * Returns entries whose expiresDate is strictly before today (UTC midnight).
 */
export function filterExpiredExceptions(
  entries: LedgerException[],
  today: Date,
): LedgerException[] {
  return entries.filter((entry) => entry.expiresDate.getTime() < today.getTime());
}

/**
 * Returns the number of calendar days an exception is past its expiry date.
 * Returns 0 if not yet expired.
 */
export function daysOverdue(expiresDate: Date, today: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = today.getTime() - expiresDate.getTime();
  return diff > 0 ? Math.ceil(diff / msPerDay) : 0;
}
