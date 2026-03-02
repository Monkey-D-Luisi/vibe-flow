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
import { PrBotAutomation } from './github/pr-bot.js';
import { CiFeedbackAutomation } from './github/ci-feedback.js';
import {
  resolveConcurrencyConfig,
  resolveGithubConfig,
  resolveProjectConfig,
} from './config/plugin-config.js';
import { registerProcessShutdownHooks } from './lifecycle/process-shutdown.js';
import { initializeWorkspaces } from './services/workspace-init.js';
import { MonitoringCron } from './services/monitoring-cron.js';
import { createGracefulShutdown } from './hooks/graceful-shutdown.js';
import { registerHttpRoutes } from './registration/http-routes.js';

export type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export { resolveConcurrencyConfig } from './config/plugin-config.js';

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
  const projectConfig = resolveProjectConfig(pluginConfig);

  // Initialize project workspaces asynchronously (clone or fetch on boot)
  initializeWorkspaces(projectConfig, api.logger).catch((err: unknown) => {
    api.logger.warn(`workspace-init failed: ${String(err)}`);
  });
  const eventLog = new EventLog(eventRepo, generateId, now);
  const leaseManager = new LeaseManager(leaseRepo, eventLog, now, undefined, concurrencyConfig);

  // Shared event-log health probe used by both monitoring cron and /health handler.
  // Queries event_log directly so it can fail independently of the generic DB check.
  const eventLogWritable = (): boolean => {
    try {
      db.prepare('SELECT 1 FROM event_log LIMIT 1').get();
      return true;
    } catch {
      return false;
    }
  };

  // Start monitoring cron (posts health/activity/cost to Telegram on schedule)
  const telegramChatId =
    typeof pluginConfig?.telegramChatId === 'string' ? pluginConfig.telegramChatId : undefined;
  const monitoringCron = new MonitoringCron({
    healthCheckDeps: {
      db,
      pluginConfig,
      eventLogWritable,
    },
    eventRepo,
    logger: api.logger,
    telegramChatId,
  });
  monitoringCron.start();

  // Register graceful shutdown: release leases, WAL checkpoint, close DB, stop cron
  const gracefulShutdown = createGracefulShutdown({
    db,
    leaseRepo,
    logger: api.logger,
    stopMonitoringCron: () => monitoringCron.stop(),
  });
  registerProcessShutdownHooks(() => {
    gracefulShutdown();
    try {
      db.close();
      api.logger.info('database closed');
    } catch (err: unknown) {
      api.logger.warn(`failed to close database during shutdown: ${String(err)}`);
    }
  });
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
  const prBotAutomation = new PrBotAutomation({
    taskReader: taskRepo,
    labelService,
    prService,
    ghClient,
    eventLog,
    logger: api.logger,
    githubOwner: githubConfig.owner,
    githubRepo: githubConfig.repo,
    defaultBase: githubConfig.defaultBase,
    config: githubConfig.prBot,
  });
  const ciFeedbackAutomation = new CiFeedbackAutomation({
    taskRepo,
    orchestratorRepo,
    leaseManager,
    requestRepo,
    eventLog,
    ghClient,
    generateId,
    now,
    transitionDeps: {
      db,
      taskRepo,
      orchestratorRepo,
      leaseRepo,
      eventLog,
      now,
      guardConfig: transitionGuardConfig,
      concurrencyConfig,
    },
    logger: api.logger,
    config: githubConfig.ciFeedback,
  });

  // Resolve agent and decision configs for EP08 tools
  const rawAgents = pluginConfig?.agents;
  const agentConfig: Array<{ id: string; name: string; model?: { primary?: string } }> =
    Array.isArray(rawAgents)
      ? rawAgents.filter(
          (a): a is { id: string; name: string; model?: { primary?: string } } =>
            typeof a === 'object' && a !== null &&
            typeof (a as Record<string, unknown>)['id'] === 'string' &&
            typeof (a as Record<string, unknown>)['name'] === 'string',
        )
      : [];
  const rawDecisions = (
    typeof pluginConfig?.decisions === 'object' && pluginConfig.decisions !== null
      ? pluginConfig.decisions
      : {}
  ) as Record<string, unknown>;
  const decisionConfig = {
    policies: typeof rawDecisions['policies'] === 'object' && rawDecisions['policies'] !== null
      ? rawDecisions['policies'] as Record<string, unknown>
      : undefined,
    timeoutMs: typeof rawDecisions['timeoutMs'] === 'number' ? rawDecisions['timeoutMs'] : undefined,
    humanApprovalTimeout: typeof rawDecisions['humanApprovalTimeout'] === 'number'
      ? rawDecisions['humanApprovalTimeout']
      : undefined,
  };

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
    projectConfig,
    agentConfig,
    decisionConfig,
    vcs: {
      requestRepo,
      branchService,
      prService,
      labelService,
    },
  };
  const tools = getAllToolDefs(deps);

  for (const tool of tools) {
    // OpenAI-compatible providers reject dots in tool names (pattern: ^[a-zA-Z0-9_-]+$).
    // Convert dots to underscores so tools work across all providers.
    tool.name = tool.name.replace(/\./g, '_');
    api.registerTool(tool);
  }

  registerHttpRoutes(
    api,
    { healthCheck: { db, pluginConfig, eventLogWritable }, githubConfig },
    { ciFeedbackAutomation },
  );

  if (githubConfig.prBot.enabled) {
    api.on('after_tool_call', async (event, ctx) => {
      try {
        await prBotAutomation.handleAfterToolCall(event, ctx);
      } catch (error: unknown) {
        api.logger.warn(`pr-bot after_tool_call hook failed: ${String(error)}`);
      }
    });
    api.logger.info('registered PR-Bot after_tool_call hook');
  }

  // Decision escalation hook: log escalation events for observability
  api.on('after_tool_call', (event, ctx) => {
    if (event.toolName !== 'decision_evaluate') return;
    if (event.error) return;
    try {
      const details = (event.result && typeof event.result === 'object')
        ? (event.result as Record<string, unknown>)['details'] ?? event.result
        : null;
      if (!details || typeof details !== 'object') return;
      const d = details as Record<string, unknown>;
      if (d['escalated'] !== true) return;
      const approver = String(d['approver'] ?? 'unknown');
      const decisionId = String(d['decisionId'] ?? 'unknown');
      const nextAction = d['nextAction'] as Record<string, unknown> | undefined;
      api.logger.info(
        `decision-escalation: Decision ${decisionId} escalated to ${approver} by agent ${ctx.agentId ?? 'unknown'}` +
        (nextAction ? ` — nextAction: spawn_subagent(${String(nextAction['agentId'])})` : ''),
      );
    } catch (err: unknown) {
      api.logger.warn(`decision-escalation hook failed: ${String(err)}`);
    }
  });
  api.logger.info('registered decision-escalation after_tool_call hook');

  api.logger.info(`registered ${tools.length} task/workflow/quality/vcs/messaging/decision/pipeline tools`);
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
