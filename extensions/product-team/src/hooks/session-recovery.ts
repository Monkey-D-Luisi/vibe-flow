/**
 * Session Recovery Hook
 *
 * Detects corrupted agent sessions via the `agent_end` hook and auto-clears
 * the broken session file so the next spawn gets a fresh session.
 *
 * Known corruption patterns:
 * - "No tool call found for function call output" — orphaned function_call_output in .jsonl
 * - "role_ordering" — SDK error kind for sequence violations
 * - "Unexpected non-whitespace character after JSON" — truncated/malformed session
 */

import { join } from 'node:path';
import { readdirSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

interface SessionRecoveryLogger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
}

/** Error patterns that indicate a corrupted session file. */
const CORRUPTION_PATTERNS: ReadonlyArray<string> = [
  'No tool call found for function call output',
  'role_ordering',
  'Unexpected non-whitespace character after JSON',
];

/**
 * Clear all session files for a given agent.
 *
 * Deletes every `.jsonl` file in `<stateDir>/agents/<agentId>/sessions/`
 * and removes the agent's entry from `sessions.json`.
 *
 * No-op if the sessions directory doesn't exist.
 */
export function clearAgentSessions(
  stateDir: string,
  agentId: string,
  logger: SessionRecoveryLogger,
): void {
  const sessDir = join(stateDir, 'agents', agentId, 'sessions');

  // Delete .jsonl session files
  let deleted = 0;
  try {
    const files = readdirSync(sessDir);
    for (const f of files) {
      if (f.endsWith('.jsonl')) {
        try {
          unlinkSync(join(sessDir, f));
          deleted++;
        } catch {
          // best effort
        }
      }
    }
  } catch {
    // Directory doesn't exist — nothing to clean
    return;
  }

  // Clean sessions.json
  const sessionsJson = join(sessDir, 'sessions.json');
  try {
    const raw = readFileSync(sessionsJson, 'utf-8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    const mainKey = `agent:${agentId}:main`;
    let changed = false;
    for (const key of Object.keys(data)) {
      if (key === mainKey || key.includes(agentId)) {
        delete data[key];
        changed = true;
      }
    }
    if (changed) {
      writeFileSync(sessionsJson, JSON.stringify(data, null, 2), 'utf-8');
    }
  } catch {
    // sessions.json doesn't exist or isn't parseable — that's fine
  }

  if (deleted > 0) {
    logger.info(`session-recovery: cleared ${deleted} session file(s) for "${agentId}"`);
  }
}

/**
 * Register the `agent_end` hook that auto-clears corrupted sessions.
 */
export function registerSessionRecoveryHook(
  api: OpenClawPluginApi,
  stateDir: string,
): void {
  api.on('agent_end', (event, ctx) => {
    const typedEvent = event as {
      success: boolean;
      error?: string;
      durationMs?: number;
    };
    const typedCtx = ctx as {
      agentId?: string;
      sessionId?: string;
      sessionKey?: string;
    };

    // Only act on failures
    if (typedEvent.success) return;

    const errorMsg = typedEvent.error ?? '';
    const isCorruption = CORRUPTION_PATTERNS.some((p) => errorMsg.includes(p));
    if (!isCorruption) return;

    const agentId = typedCtx.agentId;
    if (!agentId) {
      api.logger.warn('session-recovery: agent_end error but no agentId in context');
      return;
    }

    api.logger.warn(
      `session-recovery: detected corrupted session for "${agentId}" ` +
      `(error: ${errorMsg.slice(0, 120)}). Clearing session files.`,
    );

    try {
      clearAgentSessions(stateDir, agentId, api.logger);
    } catch (err: unknown) {
      api.logger.warn(`session-recovery: failed to clear sessions for "${agentId}": ${String(err)}`);
    }
  });

  api.logger.info('registered session-recovery agent_end hook');
}
