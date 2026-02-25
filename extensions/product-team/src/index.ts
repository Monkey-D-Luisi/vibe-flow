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
import { SqliteRequestRepository } from './persistence/request-repository.js';
import { EventLog } from './orchestrator/event-log.js';
import { LeaseManager } from './orchestrator/lease-manager.js';
import { resolveTransitionGuardConfig } from './orchestrator/transition-guards.js';
import { getAllToolDefs } from './tools/index.js';
import { createValidator } from './schemas/validator.js';
import { GhClient } from './github/gh-client.js';
import { BranchService } from './github/branch-service.js';
import { PrService } from './github/pr-service.js';
import { LabelService } from './github/label-service.js';

export type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

interface GithubConfig {
  readonly owner: string;
  readonly repo: string;
  readonly defaultBase: string;
  readonly timeoutMs: number;
}

interface ConcurrencyConfig {
  readonly maxLeasesPerAgent: number;
  readonly maxTotalLeases: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function resolveGithubConfig(pluginConfig: Record<string, unknown> | undefined): GithubConfig {
  const github = asRecord(pluginConfig?.github);
  return {
    owner: asNonEmptyString(github?.owner) ?? 'local-owner',
    repo: asNonEmptyString(github?.repo) ?? 'local-repo',
    defaultBase: asNonEmptyString(github?.defaultBase) ?? 'main',
    timeoutMs: asPositiveInteger(github?.timeoutMs) ?? 30_000,
  };
}

function resolveConcurrencyConfig(
  pluginConfig: Record<string, unknown> | undefined,
): ConcurrencyConfig {
  const workflow = asRecord(pluginConfig?.workflow);
  const concurrency = asRecord(workflow?.concurrency) ?? asRecord(pluginConfig?.concurrency);
  return {
    maxLeasesPerAgent: asPositiveInteger(concurrency?.maxLeasesPerAgent) ?? 3,
    maxTotalLeases: asPositiveInteger(concurrency?.maxTotalLeases) ?? 10,
  };
}

export function register(api: OpenClawPluginApi): void {
  api.logger.info('product-team plugin loaded');

  // Initialize database
  const pluginConfig = api.pluginConfig as Record<string, unknown> | undefined;
  const dbPath = typeof pluginConfig?.dbPath === 'string' ? pluginConfig.dbPath : ':memory:';
  const resolvedPath = api.resolvePath(dbPath);
  const workspaceDir = api.resolvePath('.');

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
    } catch (error: unknown) {
      api.logger.warn(`failed to close database during shutdown: ${String(error)}`);
    }
  };
  process.once('exit', closeDb);
  process.once('SIGINT', closeDb);
  process.once('SIGTERM', closeDb);

  api.logger.info(`database initialized at ${resolvedPath}`);

  // Create repositories
  const taskRepo = new SqliteTaskRepository(db);
  const orchestratorRepo = new SqliteOrchestratorRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const leaseRepo = new SqliteLeaseRepository(db);
  const requestRepo = new SqliteRequestRepository(db);

  // Create orchestrator services
  const generateId = () => ulid();
  const now = () => new Date().toISOString();
  const validate = createValidator();
  const transitionGuardConfig = resolveTransitionGuardConfig(pluginConfig?.workflow);
  const concurrencyConfig = resolveConcurrencyConfig(pluginConfig);
  const eventLog = new EventLog(eventRepo, generateId, now);
  const leaseManager = new LeaseManager(leaseRepo, eventLog, now, undefined, concurrencyConfig);
  const githubConfig = resolveGithubConfig(pluginConfig);
  const ghClient = new GhClient({
    owner: githubConfig.owner,
    repo: githubConfig.repo,
    timeoutMs: githubConfig.timeoutMs,
  });
  const branchService = new BranchService({
    ghClient,
    requestRepo,
    eventLog,
    generateId,
    now,
    defaultBase: githubConfig.defaultBase,
  });
  const prService = new PrService({
    ghClient,
    requestRepo,
    eventLog,
    generateId,
    now,
    defaultBase: githubConfig.defaultBase,
  });
  const labelService = new LabelService({
    ghClient,
    requestRepo,
    eventLog,
    generateId,
    now,
  });

  // Register EP02 tools
  const deps = {
    db,
    taskRepo,
    orchestratorRepo,
    leaseRepo,
    eventLog,
    generateId,
    now,
    validate,
    transitionGuardConfig,
    concurrencyConfig,
    leaseManager,
    logger: api.logger,
    workspaceDir,
    vcs: {
      requestRepo,
      branchService,
      prService,
      labelService,
    },
  };
  const tools = getAllToolDefs(deps);

  for (const tool of tools) {
    api.registerTool(tool);
  }

  api.logger.info(`registered ${tools.length} task/workflow/quality/vcs tools`);
  // EP03: workflow.step.run, workflow.state.get
  // EP04: vcs_branch_create, vcs_pr_create, vcs_pr_update, vcs_label_sync
  // EP05: quality_coverage, quality_lint, quality_complexity
}

export default {
  id: 'product-team',
  name: 'Product Team Engine',
  description: 'Task engine + workflow tools for a multi-agent product team',
  register,
};
