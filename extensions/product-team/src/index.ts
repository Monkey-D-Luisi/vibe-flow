/**
 * OpenClaw Plugin: Product Team Engine
 *
 * Registers task lifecycle, workflow, quality gate, and VCS tools
 * for orchestrating a multi-agent product development team.
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { ulid } from 'ulid';
import { resolve, isAbsolute, relative } from 'node:path';
import { createDatabase } from './persistence/connection.js';
import { runMigrations } from './persistence/migrations.js';
import { SqliteTaskRepository } from './persistence/task-repository.js';
import { SqliteOrchestratorRepository } from './persistence/orchestrator-repository.js';
import { SqliteEventRepository } from './persistence/event-repository.js';
import { SqliteLeaseRepository } from './persistence/lease-repository.js';
import { EventLog } from './orchestrator/event-log.js';
import { getAllToolDefs } from './tools/index.js';
import { createValidator } from './schemas/validator.js';

export type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

export function register(api: OpenClawPluginApi): void {
  api.logger.info('product-team plugin loaded');

  // Initialize database
  const pluginConfig = api.pluginConfig as Record<string, unknown> | undefined;
  const dbPath = typeof pluginConfig?.dbPath === 'string' ? pluginConfig.dbPath : ':memory:';
  const resolvedPath = api.resolvePath(dbPath);

  // Validate database path stays within workspace (skip for in-memory DBs)
  if (resolvedPath !== ':memory:') {
    const workspaceRoot = api.resolvePath('.');
    const rootAbs = resolve(workspaceRoot);
    const dbAbs = resolve(resolvedPath);
    const rel = relative(rootAbs, dbAbs);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`Database path "${dbPath}" escapes workspace root`);
    }
  }

  const db = createDatabase(resolvedPath);
  runMigrations(db);

  // Close database on process exit to flush WAL
  const closeDb = () => {
    try {
      db.close();
      api.logger.info('database closed');
    } catch {
      // Best-effort close — ignore errors during shutdown
    }
  };
  process.on('exit', closeDb);
  process.on('SIGINT', closeDb);
  process.on('SIGTERM', closeDb);

  api.logger.info(`database initialized at ${resolvedPath}`);

  // Create repositories
  const taskRepo = new SqliteTaskRepository(db);
  const orchestratorRepo = new SqliteOrchestratorRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const leaseRepo = new SqliteLeaseRepository(db);

  // Create orchestrator services
  const generateId = () => ulid();
  const now = () => new Date().toISOString();
  const validate = createValidator();
  const eventLog = new EventLog(eventRepo, generateId, now);

  // Register EP02 tools
  const deps = { db, taskRepo, orchestratorRepo, leaseRepo, eventLog, generateId, now, validate };
  const tools = getAllToolDefs(deps);

  for (const tool of tools) {
    api.registerTool(tool);
  }

  api.logger.info(`registered ${tools.length} task engine tools`);
  // EP03: workflow_step_run, workflow_state_get
  // EP04: vcs_branch_create, vcs_pr_create, vcs_pr_update, vcs_label_sync
  // EP05: quality_coverage, quality_lint, quality_complexity
}

export default {
  id: 'product-team',
  name: 'Product Team Engine',
  description: 'Task engine + workflow tools for a multi-agent product team',
  register,
};
