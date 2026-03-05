import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SpawnService } from '../../src/services/spawn-service.js';
import type { SpawnServiceDeps } from '../../src/services/spawn-service.js';
import type { AgentSpawnSink } from '../../src/hooks/auto-spawn.js';

function createTestDeps(overrides?: Partial<SpawnServiceDeps>): SpawnServiceDeps {
  const db = new Database(':memory:');
  const primarySpawner: AgentSpawnSink = {
    spawnAgent: vi.fn(),
  };
  return {
    db,
    generateId: vi.fn(() => `id-${Math.random().toString(36).slice(2, 8)}`),
    now: vi.fn(() => '2026-03-05T12:00:00.000Z'),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    primarySpawner,
    ...overrides,
  };
}

describe('SpawnService', () => {
  let deps: SpawnServiceDeps;
  let service: SpawnService;

  beforeEach(() => {
    deps = createTestDeps();
    service = new SpawnService(deps);
  });

  afterEach(() => {
    service.stop();
    deps.db.close();
  });

  it('creates spawn_queue table on construction', () => {
    const tables = deps.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='spawn_queue'")
      .all();
    expect(tables).toHaveLength(1);
  });

  it('records and delivers a spawn request immediately', () => {
    service.spawnAgent('tech-lead', 'Review this decision');

    expect(deps.primarySpawner.spawnAgent).toHaveBeenCalledWith(
      'tech-lead',
      'Review this decision',
      {},
    );

    const rows = deps.db.prepare('SELECT * FROM spawn_queue').all() as Array<{ status: string; target_agent: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('delivered');
    expect(rows[0]!.target_agent).toBe('tech-lead');
  });

  it('marks record as failed when primarySpawner throws', () => {
    const failingSpawner: AgentSpawnSink = {
      spawnAgent: vi.fn(() => { throw new Error('WS connection failed'); }),
    };
    deps = createTestDeps({ primarySpawner: failingSpawner });
    service = new SpawnService(deps);

    service.spawnAgent('back-1', 'Do something');

    const rows = deps.db.prepare('SELECT * FROM spawn_queue').all() as Array<{ status: string; error: string | null }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('failed');
    expect(rows[0]!.error).toContain('WS connection failed');
  });

  it('sweepRetryQueue retries failed records', () => {
    const failingSpawner: AgentSpawnSink = {
      spawnAgent: vi.fn()
        .mockImplementationOnce(() => { throw new Error('fail'); })
        .mockImplementation(() => {}),
    };
    deps = createTestDeps({ primarySpawner: failingSpawner });
    service = new SpawnService(deps);

    service.spawnAgent('qa', 'Run tests');

    // First attempt failed
    let rows = deps.db.prepare('SELECT * FROM spawn_queue').all() as Array<{ status: string; attempts: number }>;
    expect(rows[0]!.status).toBe('failed');
    expect(rows[0]!.attempts).toBe(1);

    // Sweep retries and succeeds
    const processed = service.sweepRetryQueue();
    expect(processed).toBe(1);

    rows = deps.db.prepare('SELECT * FROM spawn_queue').all() as Array<{ status: string; attempts: number }>;
    expect(rows[0]!.status).toBe('delivered');
    expect(rows[0]!.attempts).toBe(2);
  });

  it('moves to dead_letter after maxRetries', () => {
    const deadLetterCallback = vi.fn();
    const failingSpawner: AgentSpawnSink = {
      spawnAgent: vi.fn(() => { throw new Error('always fails'); }),
    };
    deps = createTestDeps({
      primarySpawner: failingSpawner,
      maxRetries: 2,
      deadLetterCallback,
    });
    service = new SpawnService(deps);

    service.spawnAgent('devops', 'Deploy');

    // attempts=1, failed
    service.sweepRetryQueue(); // attempts=2, failed
    service.sweepRetryQueue(); // attempts >= maxRetries → dead_letter

    const rows = deps.db.prepare('SELECT * FROM spawn_queue').all() as Array<{ status: string }>;
    expect(rows[0]!.status).toBe('dead_letter');
    expect(deadLetterCallback).toHaveBeenCalledOnce();
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Dead letter'),
    );
  });

  it('start() and stop() manage the periodic sweep timer', () => {
    service.start();
    expect(deps.logger.info).toHaveBeenCalledWith('spawn-service: started retry queue');

    service.stop();
    expect(deps.logger.info).toHaveBeenCalledWith('spawn-service: stopped retry queue');
  });

  it('passes options through to primarySpawner', () => {
    service.spawnAgent('pm', 'Check inbox', { accountId: 'pm', channel: 'telegram' });

    expect(deps.primarySpawner.spawnAgent).toHaveBeenCalledWith(
      'pm',
      'Check inbox',
      { accountId: 'pm', channel: 'telegram' },
    );
  });
});
