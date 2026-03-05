/**
 * Spawn Service Abstraction (Task 0067)
 *
 * Decouples agent spawning from the SDK-internal WS implementation.
 * Provides a clean testable interface with:
 * - Primary: Gateway WS spawn (existing fireAgentViaGatewayWs)
 * - Fallback: CLI spawn via `openclaw agent`
 * - Retry queue with dead-letter alerting (Task 0066)
 */

import type Database from 'better-sqlite3';
import type { AgentSpawnSink, AgentSpawnOptions, AutoSpawnLogger } from '../hooks/auto-spawn.js';

export interface SpawnRecord {
  id: string;
  target_agent: string;
  message: string;
  options: string; // JSON
  status: 'pending' | 'delivered' | 'failed' | 'dead_letter';
  attempts: number;
  created_at: string;
  updated_at: string;
  error: string | null;
}

export interface SpawnServiceDeps {
  readonly db: Database.Database;
  readonly generateId: () => string;
  readonly now: () => string;
  readonly logger: AutoSpawnLogger;
  readonly primarySpawner: AgentSpawnSink;
  readonly maxRetries?: number;
  readonly deadLetterCallback?: (record: SpawnRecord) => void;
}

const SPAWN_QUEUE_TABLE = 'spawn_queue';
const DEFAULT_MAX_RETRIES = 3;
const SWEEP_INTERVAL_MS = 30_000; // 30 seconds

function ensureSpawnQueueTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SPAWN_QUEUE_TABLE} (
      id TEXT PRIMARY KEY,
      target_agent TEXT NOT NULL,
      message TEXT NOT NULL,
      options TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      error TEXT
    )
  `);
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_spawn_queue_status ON ${SPAWN_QUEUE_TABLE}(status)`);
  } catch {
    // index may already exist
  }
}

/**
 * SpawnService wraps the fire-and-forget agent spawning with a
 * persistent retry queue and dead-letter handling.
 */
export class SpawnService implements AgentSpawnSink {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly maxRetries: number;

  constructor(private readonly deps: SpawnServiceDeps) {
    this.maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES;
    ensureSpawnQueueTable(deps.db);
  }

  /**
   * Spawn an agent. Records the request in the queue, then attempts
   * immediate delivery via the primary spawner.
   */
  spawnAgent(agentId: string, message: string, options?: AgentSpawnOptions): void {
    const record: SpawnRecord = {
      id: this.deps.generateId(),
      target_agent: agentId,
      message,
      options: JSON.stringify(options ?? {}),
      status: 'pending',
      attempts: 0,
      created_at: this.deps.now(),
      updated_at: this.deps.now(),
      error: null,
    };

    // Persist to queue before attempting spawn
    this.deps.db.prepare(`
      INSERT INTO ${SPAWN_QUEUE_TABLE} (id, target_agent, message, options, status, attempts, created_at, updated_at, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(record.id, record.target_agent, record.message, record.options, record.status, record.attempts, record.created_at, record.updated_at, record.error);

    // Attempt immediate delivery
    this.attemptDelivery(record);
  }

  /** Process pending records in the retry queue. */
  sweepRetryQueue(): number {
    let processed = 0;

    const pending = this.deps.db.prepare(`
      SELECT * FROM ${SPAWN_QUEUE_TABLE}
      WHERE status = 'pending' OR status = 'failed'
      ORDER BY created_at ASC
      LIMIT 50
    `).all() as SpawnRecord[];

    for (const record of pending) {
      if (record.attempts >= this.maxRetries) {
        // Move to dead letter
        this.deps.db.prepare(`
          UPDATE ${SPAWN_QUEUE_TABLE} SET status = 'dead_letter', updated_at = ? WHERE id = ?
        `).run(this.deps.now(), record.id);

        this.deps.logger.warn(
          `spawn-service: Dead letter — agent ${record.target_agent} after ${record.attempts} attempts: ${record.error}`,
        );

        if (this.deps.deadLetterCallback) {
          try {
            this.deps.deadLetterCallback(record);
          } catch {
            // best effort
          }
        }
        processed++;
        continue;
      }

      this.attemptDelivery(record);
      processed++;
    }

    return processed;
  }

  /** Start the periodic retry sweep. */
  start(): void {
    this.timer = setInterval(() => {
      try {
        this.sweepRetryQueue();
      } catch (err: unknown) {
        this.deps.logger.warn(`spawn-service: retry sweep failed: ${String(err)}`);
      }
    }, SWEEP_INTERVAL_MS).unref();

    this.deps.logger.info('spawn-service: started retry queue');
  }

  /** Stop the periodic retry sweep. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.deps.logger.info('spawn-service: stopped retry queue');
  }

  private attemptDelivery(record: SpawnRecord): void {
    try {
      const opts = JSON.parse(record.options) as AgentSpawnOptions;
      this.deps.primarySpawner.spawnAgent(record.target_agent, record.message, opts);

      // Mark delivered
      this.deps.db.prepare(`
        UPDATE ${SPAWN_QUEUE_TABLE}
        SET status = 'delivered', attempts = attempts + 1, updated_at = ?
        WHERE id = ?
      `).run(this.deps.now(), record.id);

      this.deps.logger.info(`spawn-service: delivered to ${record.target_agent} (id: ${record.id})`);
    } catch (err: unknown) {
      // Mark failed with error
      this.deps.db.prepare(`
        UPDATE ${SPAWN_QUEUE_TABLE}
        SET status = 'failed', attempts = attempts + 1, error = ?, updated_at = ?
        WHERE id = ?
      `).run(String(err), this.deps.now(), record.id);

      this.deps.logger.warn(
        `spawn-service: delivery failed for ${record.target_agent} (attempt ${record.attempts + 1}): ${String(err)}`,
      );
    }
  }
}
