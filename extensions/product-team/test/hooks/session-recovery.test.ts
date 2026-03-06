import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { clearAgentSessions } from '../../src/hooks/session-recovery.js';

function makeTempStateDir(): string {
  const base = join(tmpdir(), `session-recovery-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(base, { recursive: true });
  return base;
}

function createAgentSessionDir(stateDir: string, agentId: string): string {
  const sessDir = join(stateDir, 'agents', agentId, 'sessions');
  mkdirSync(sessDir, { recursive: true });
  return sessDir;
}

describe('session-recovery', () => {
  let stateDir: string;
  let logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    stateDir = makeTempStateDir();
    logger = { info: vi.fn(), warn: vi.fn() };
  });

  describe('clearAgentSessions', () => {
    it('deletes .jsonl files from sessions directory', () => {
      const sessDir = createAgentSessionDir(stateDir, 'tech-lead');
      writeFileSync(join(sessDir, 'abc-123.jsonl'), '{"type":"message"}');
      writeFileSync(join(sessDir, 'def-456.jsonl'), '{"type":"message"}');

      clearAgentSessions(stateDir, 'tech-lead', logger);

      const remaining = readdirSync(sessDir).filter(f => f.endsWith('.jsonl'));
      expect(remaining).toHaveLength(0);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('cleared 2 session file(s) for "tech-lead"'),
      );
    });

    it('updates sessions.json to remove agent entry', () => {
      const sessDir = createAgentSessionDir(stateDir, 'back-1');
      writeFileSync(join(sessDir, 'sess-1.jsonl'), '{}');
      writeFileSync(
        join(sessDir, 'sessions.json'),
        JSON.stringify({
          'agent:back-1:main': { sessionId: 'sess-1' },
          'agent:pm:main': { sessionId: 'pm-sess' },
        }),
      );

      clearAgentSessions(stateDir, 'back-1', logger);

      const updated = JSON.parse(readFileSync(join(sessDir, 'sessions.json'), 'utf-8'));
      expect(updated['agent:back-1:main']).toBeUndefined();
      expect(updated['agent:pm:main']).toEqual({ sessionId: 'pm-sess' });
    });

    it('handles missing sessions directory gracefully', () => {
      // No sessions directory exists for this agent
      clearAgentSessions(stateDir, 'nonexistent-agent', logger);

      // Should not throw, should not log (nothing to clean)
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('preserves non-jsonl files', () => {
      const sessDir = createAgentSessionDir(stateDir, 'qa');
      writeFileSync(join(sessDir, 'something.jsonl'), '{}');
      writeFileSync(join(sessDir, 'sessions.json'), '{}');
      writeFileSync(join(sessDir, 'notes.txt'), 'keep me');

      clearAgentSessions(stateDir, 'qa', logger);

      const remaining = readdirSync(sessDir);
      expect(remaining).toContain('sessions.json');
      expect(remaining).toContain('notes.txt');
      expect(remaining).not.toContain('something.jsonl');
    });
  });

  describe('registerSessionRecoveryHook', () => {
    it('no-ops when event.success === true', async () => {
      const { registerSessionRecoveryHook } = await import('../../src/hooks/session-recovery.js');
      const handlers: Array<(event: unknown, ctx: unknown) => void> = [];
      const api = {
        on: vi.fn((name: string, handler: (event: unknown, ctx: unknown) => void) => {
          handlers.push(handler);
        }),
        logger: { info: vi.fn(), warn: vi.fn() },
      };

      registerSessionRecoveryHook(api as never, stateDir);

      // Simulate successful agent_end — should not clear anything
      const sessDir = createAgentSessionDir(stateDir, 'pm');
      writeFileSync(join(sessDir, 'sess.jsonl'), '{}');

      handlers[0]!(
        { success: true, messages: [] },
        { agentId: 'pm', sessionId: 'sess' },
      );

      expect(existsSync(join(sessDir, 'sess.jsonl'))).toBe(true);
    });

    it('clears session on "No tool call found" error', async () => {
      const { registerSessionRecoveryHook } = await import('../../src/hooks/session-recovery.js');
      const handlers: Array<(event: unknown, ctx: unknown) => void> = [];
      const api = {
        on: vi.fn((name: string, handler: (event: unknown, ctx: unknown) => void) => {
          handlers.push(handler);
        }),
        logger: { info: vi.fn(), warn: vi.fn() },
      };

      registerSessionRecoveryHook(api as never, stateDir);

      const sessDir = createAgentSessionDir(stateDir, 'tech-lead');
      writeFileSync(join(sessDir, 'corrupt.jsonl'), '{}');

      handlers[0]!(
        {
          success: false,
          error: 'No tool call found for function call output with call_id toolu_01QMzr6EnW3XhaFSRCFXVwPz',
          messages: [],
        },
        { agentId: 'tech-lead', sessionId: 'corrupt' },
      );

      const remaining = readdirSync(sessDir).filter(f => f.endsWith('.jsonl'));
      expect(remaining).toHaveLength(0);
      expect(api.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('detected corrupted session for "tech-lead"'),
      );
    });

    it('clears session on "role_ordering" error', async () => {
      const { registerSessionRecoveryHook } = await import('../../src/hooks/session-recovery.js');
      const handlers: Array<(event: unknown, ctx: unknown) => void> = [];
      const api = {
        on: vi.fn((name: string, handler: (event: unknown, ctx: unknown) => void) => {
          handlers.push(handler);
        }),
        logger: { info: vi.fn(), warn: vi.fn() },
      };

      registerSessionRecoveryHook(api as never, stateDir);

      const sessDir = createAgentSessionDir(stateDir, 'designer');
      writeFileSync(join(sessDir, 'bad.jsonl'), '{}');

      handlers[0]!(
        { success: false, error: 'role_ordering error in session', messages: [] },
        { agentId: 'designer', sessionId: 'bad' },
      );

      const remaining = readdirSync(sessDir).filter(f => f.endsWith('.jsonl'));
      expect(remaining).toHaveLength(0);
    });

    it('handles missing agentId gracefully', async () => {
      const { registerSessionRecoveryHook } = await import('../../src/hooks/session-recovery.js');
      const handlers: Array<(event: unknown, ctx: unknown) => void> = [];
      const api = {
        on: vi.fn((name: string, handler: (event: unknown, ctx: unknown) => void) => {
          handlers.push(handler);
        }),
        logger: { info: vi.fn(), warn: vi.fn() },
      };

      registerSessionRecoveryHook(api as never, stateDir);

      // Should not throw
      handlers[0]!(
        { success: false, error: 'No tool call found for function call output', messages: [] },
        { sessionId: 'some-id' }, // no agentId
      );

      expect(api.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('no agentId in context'),
      );
    });

    it('ignores non-corruption errors', async () => {
      const { registerSessionRecoveryHook } = await import('../../src/hooks/session-recovery.js');
      const handlers: Array<(event: unknown, ctx: unknown) => void> = [];
      const api = {
        on: vi.fn((name: string, handler: (event: unknown, ctx: unknown) => void) => {
          handlers.push(handler);
        }),
        logger: { info: vi.fn(), warn: vi.fn() },
      };

      registerSessionRecoveryHook(api as never, stateDir);

      const sessDir = createAgentSessionDir(stateDir, 'po');
      writeFileSync(join(sessDir, 'good.jsonl'), '{}');

      handlers[0]!(
        { success: false, error: 'Rate limit exceeded', messages: [] },
        { agentId: 'po', sessionId: 'good' },
      );

      // Session should NOT be cleared for a rate limit error
      expect(existsSync(join(sessDir, 'good.jsonl'))).toBe(true);
    });
  });
});
