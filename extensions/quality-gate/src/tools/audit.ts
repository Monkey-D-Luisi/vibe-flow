/**
 * Tool: qgate.audit
 *
 * Runs package manager audit (pnpm or npm) and reports critical/high
 * vulnerability counts. Auto-detects package manager from lockfile presence.
 */

import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { safeSpawn, assertSafeCommand, parseCommand, assertPathContained } from '@openclaw/quality-contracts/exec/spawn';
import {
  assertOptionalString,
  assertOptionalStringEnum,
} from '@openclaw/quality-contracts/validate/tools';

export interface AuditInput {
  cwd?: string;
  packageManager?: 'pnpm' | 'npm';
}

export interface AuditOutput {
  packageManager: string;
  critical: number;
  high: number;
  moderate: number;
  low: number;
  total: number;
  raw?: string;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function detectPackageManager(cwd: string): Promise<'pnpm' | 'npm'> {
  if (await fileExists(resolve(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  return 'npm';
}

export function parsePnpmAuditJson(raw: string): Pick<AuditOutput, 'critical' | 'high' | 'moderate' | 'low' | 'total' | 'raw'> {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const metadata = data['metadata'] as Record<string, unknown> | undefined;
    const vulnerabilities = metadata?.['vulnerabilities'] as Record<string, number> | undefined;

    if (vulnerabilities) {
      const critical = vulnerabilities['critical'] ?? 0;
      const high = vulnerabilities['high'] ?? 0;
      const moderate = vulnerabilities['moderate'] ?? 0;
      const low = vulnerabilities['low'] ?? 0;
      return {
        critical,
        high,
        moderate,
        low,
        total: critical + high + moderate + low,
      };
    }
  } catch {
    // Parse failure — surface raw output so callers see something went wrong
  }

  return { critical: 0, high: 0, moderate: 0, low: 0, total: 0, raw };
}

export function parseNpmAuditJson(raw: string): Pick<AuditOutput, 'critical' | 'high' | 'moderate' | 'low' | 'total' | 'raw'> {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const metadata = data['metadata'] as Record<string, unknown> | undefined;
    const vulnerabilities = metadata?.['vulnerabilities'] as Record<string, number> | undefined;

    if (vulnerabilities) {
      const critical = vulnerabilities['critical'] ?? 0;
      const high = vulnerabilities['high'] ?? 0;
      const moderate = vulnerabilities['moderate'] ?? 0;
      const low = vulnerabilities['low'] ?? 0;
      return {
        critical,
        high,
        moderate,
        low,
        total: critical + high + moderate + low,
      };
    }
  } catch {
    // Parse failure — surface raw output so callers see something went wrong
  }

  return { critical: 0, high: 0, moderate: 0, low: 0, total: 0, raw };
}

/**
 * Execute audit tool.
 */
export async function auditTool(input: AuditInput): Promise<AuditOutput> {
  const cwd = resolve(input.cwd || process.cwd());
  assertPathContained(cwd, process.cwd());
  const pm = input.packageManager || await detectPackageManager(cwd);

  const commandStr = `${pm} audit --json`;
  const parsed = parseCommand(commandStr);
  assertSafeCommand(parsed.cmd);

  // Audit commands return non-zero exit code when vulnerabilities are found,
  // so we need to capture output regardless of exit code.
  let stdout: string;
  try {
    const result = await safeSpawn(parsed.cmd, parsed.args, {
      cwd,
      timeoutMs: 60_000,
    });
    // safeSpawn resolves on non-zero exit (audit returns non-zero when vulns found),
    // but can reject on spawn errors; capture stdout from either path.
    stdout = result.stdout;
  } catch (err: unknown) {
    // Spawn-level error (ENOENT, permission denied, etc.); try to extract stdout
    const errObj = err as Record<string, unknown>;
    if (typeof errObj['stdout'] === 'string') {
      stdout = errObj['stdout'];
    } else {
      return {
        packageManager: pm,
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        total: 0,
        raw: `Audit command failed: ${String(err)}`,
      };
    }
  }

  const counts = pm === 'pnpm'
    ? parsePnpmAuditJson(stdout)
    : parseNpmAuditJson(stdout);

  return {
    packageManager: pm,
    ...counts,
  };
}

/**
 * Tool definition for registration.
 */
export const auditToolDef = {
  name: 'qgate.audit',
  description: 'Run package manager audit (pnpm/npm) and report vulnerability counts by severity',
  parameters: {
    type: 'object',
    properties: {
      cwd: {
        type: 'string',
        description: 'Working directory (defaults to process.cwd())',
      },
      packageManager: {
        type: 'string',
        enum: ['pnpm', 'npm'],
        description: 'Package manager to use (auto-detected from lockfile if omitted)',
      },
    },
    additionalProperties: false,
  },
  execute: async (_id: string, params: Record<string, unknown>) => {
    assertOptionalString(params['cwd'], 'cwd');
    assertOptionalStringEnum(params['packageManager'], 'packageManager', ['pnpm', 'npm'] as const);
    return auditTool(params as unknown as AuditInput);
  },
};
