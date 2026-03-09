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
  resolveDeliveryConfig,
  resolveGithubConfig,
  resolveOrchestratorConfig,
  resolveProjectConfig,
} from './config/plugin-config.js';
import { registerProcessShutdownHooks } from './lifecycle/process-shutdown.js';
import { initializeWorkspaces } from './services/workspace-init.js';
import { MonitoringCron } from './services/monitoring-cron.js';
import { DecisionTimeoutCron } from './services/decision-timeout-cron.js';
import { StageTimeoutCron } from './services/stage-timeout-cron.js';
import { createGracefulShutdown } from './hooks/graceful-shutdown.js';
import { registerAutoSpawnHooks, fireAgentViaGatewayWs } from './hooks/auto-spawn.js';
import type { AgentSpawnSink, AgentSpawnOptions } from './hooks/auto-spawn.js';
import { registerSessionRecoveryHook, clearAgentSessions } from './hooks/session-recovery.js';
import type { SessionRecoveryEventEmitter } from './hooks/session-recovery.js';
import { injectOriginIntoTeamMessage } from './hooks/origin-injection.js';
import { injectAgentIdIntoDecisionEvaluate } from './hooks/agent-id-injection.js';
import { injectCallerIntoPipelineAdvance } from './hooks/pipeline-caller-injection.js';
import { registerHttpRoutes } from './registration/http-routes.js';
import { SqliteBudgetRepository } from './persistence/budget-repo.js';
import { PricingTable, parsePricingConfig, parseAllocationConfig } from './domain/pricing-table.js';
import { resolveAllocations } from './orchestrator/agent-budget-tracker.js';
import { registerBudgetHooks } from './hooks/budget-hooks.js';
import type { BudgetGuardDeps } from './orchestrator/budget-guard.js';

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

  // Budget infrastructure (EP11): pricing table, budget repo, and guard deps
  const budgetRepo = new SqliteBudgetRepository(db);
  const rawBudgetConfig = typeof pluginConfig?.budget === 'object' && pluginConfig.budget !== null
    ? pluginConfig.budget as Record<string, unknown>
    : {};
  const pricingTable = new PricingTable(parsePricingConfig(rawBudgetConfig['pricing']));
  const agentAllocations = resolveAllocations(parseAllocationConfig(rawBudgetConfig['agentAllocations']));
  const budgetGuardDeps: BudgetGuardDeps = { budgetRepo, eventLog, now };

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

  // Register graceful shutdown: release leases, WAL checkpoint, close DB, stop crons
  const gracefulShutdown = createGracefulShutdown({
    db,
    leaseRepo,
    logger: api.logger,
    stopMonitoringCron: () => {
      monitoringCron.stop();
    },
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
  // Agents live at the top-level config (api.config.agents.list), NOT in pluginConfig.
  const globalAgentsList = api.config.agents?.list;
  const agentConfig: Array<{ id: string; name: string; model?: { primary?: string } }> =
    Array.isArray(globalAgentsList)
      ? globalAgentsList
          .filter((a) => typeof a.id === 'string')
          .map((a) => ({
            id: a.id,
            name: a.name ?? a.id,
            model: typeof a.model === 'string'
              ? { primary: a.model }
              : typeof a.model === 'object' && a.model !== null
                ? { primary: (a.model as { primary?: string }).primary }
                : undefined,
          }))
      : [];
  api.logger.info(`loaded ${agentConfig.length} agents from global config: [${agentConfig.map(a => a.id).join(', ')}]`);
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
    orchestratorConfig: resolveOrchestratorConfig(pluginConfig),
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

  // Origin injection hook: auto-populates originChannel and originSessionKey in
  // team_message calls using the caller's session key (available in before_tool_call
  // ctx but NOT in after_tool_call). This ensures delivery routing works without
  // relying on the LLM to pass these fields explicitly.
  api.on('before_tool_call', (event, ctx) => {
    const typedEvent = event as { toolName: string; params: Record<string, unknown> };
    const typedCtx = ctx as { agentId?: string; sessionKey?: string };
    return injectOriginIntoTeamMessage(typedEvent, typedCtx);
  });
  api.logger.info('registered origin-injection before_tool_call hook for team_message');

  // Agent ID injection hook: auto-populates agentId in decision_evaluate calls
  // using the caller's agent identity (available in before_tool_call ctx). This
  // enables per-agent circuit breaker tracking and audit trail attribution.
  api.on('before_tool_call', (event, ctx) => {
    const typedEvent = event as { toolName: string; params: Record<string, unknown> };
    const typedCtx = ctx as { agentId?: string; sessionKey?: string };
    return injectAgentIdIntoDecisionEvaluate(typedEvent, typedCtx);
  });
  api.logger.info('registered agent-id-injection before_tool_call hook for decision_evaluate');

  // Pipeline caller injection hook: auto-populates _callerAgentId in
  // pipeline_advance calls so the tool can validate stage ownership.
  api.on('before_tool_call', (event, ctx) => {
    const typedEvent = event as { toolName: string; params: Record<string, unknown> };
    const typedCtx = ctx as { agentId?: string; sessionKey?: string };
    return injectCallerIntoPipelineAdvance(typedEvent, typedCtx);
  });
  api.logger.info('registered caller-injection before_tool_call hook for pipeline_advance');

  // Shared spawn sink: used by both auto-spawn hooks and stage-timeout cron
  const sharedSpawnSink: AgentSpawnSink = {
    spawnAgent(agentId: string, message: string, options?: AgentSpawnOptions): void {
      try {
        fireAgentViaGatewayWs(agentId, message, api.logger, options);
        api.logger.info(`shared-spawn: triggered agent "${agentId}"`);
      } catch (err: unknown) {
        api.logger.warn(`shared-spawn: failed for "${agentId}": ${String(err)}`);
      }
    },
  };

  // Auto-spawn hooks: when an agent sends a team_message or escalates a decision,
  // inject a system directive into the caller's session to spawn the target agent.
  const deliveryConfig = resolveDeliveryConfig(pluginConfig);
  registerAutoSpawnHooks(api, agentConfig, sharedSpawnSink, deliveryConfig);

  // Session recovery hook: auto-clears corrupted session files on agent_end errors
  // (e.g. orphaned function_call_output, role_ordering). Without this, corrupted
  // sessions cause infinite failure loops on every spawn retry.
  const stateDir = process.env['OPENCLAW_STATE_DIR'] || '/root/.openclaw';
  const sessionRecoveryEventEmitter: SessionRecoveryEventEmitter = {
    emit(eventType, agentId, payload) {
      try {
        const id = generateId();
        const timestamp = now();
        db.prepare(`
          INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, null, eventType, agentId, JSON.stringify(payload), timestamp);
      } catch {
        // event_log table may not exist yet
      }
    },
  };
  registerSessionRecoveryHook(api, stateDir, sessionRecoveryEventEmitter);

  // Pipeline DONE hook: clear all agent sessions when a pipeline completes
  // so the next pipeline run starts with a clean slate (no stale context).
  api.on('after_tool_call', (event) => {
    try {
      const typedEvent = event as { toolName: string; result?: unknown };
      if (typedEvent.toolName !== 'pipeline_advance') return;

      const result = typedEvent.result as Record<string, unknown> | undefined;
      if (!result) return;
      const details = (result['details'] ?? result) as Record<string, unknown>;
      if (details['advanced'] !== true || details['currentStage'] !== 'DONE') return;

      const taskId = String(details['taskId'] ?? 'unknown');
      api.logger.info(
        `pipeline-done-cleanup: pipeline reached DONE for task ${taskId}. Clearing all agent sessions.`,
      );

      for (const agent of agentConfig) {
        try {
          clearAgentSessions(stateDir, agent.id, api.logger);
        } catch {
          // best effort per agent
        }
      }

      api.logger.info(`pipeline-done-cleanup: cleared sessions for ${agentConfig.length} agents`);

      // Clear stale budget state from globalThis registry (Task 0086 CR)
      const registryKey = Symbol.for('openclaw:budget-state-registry');
      const g = globalThis as Record<symbol, unknown>;
      const registry = g[registryKey] as Map<string, unknown> | undefined;
      if (registry) registry.clear();
    } catch (err: unknown) {
      api.logger.warn(`pipeline-done-cleanup: error: ${String(err)}`);
    }
  });

  // Agent budget hooks (EP11, Task 0085): ensure, enforce, and track per-agent consumption
  // Budget state publisher (Task 0086): writes to globalThis registry for model-router
  const budgetStatePublisher = (state: { agentId: string; consumptionRatio: number; status: 'active' | 'warning' | 'exhausted'; updatedAt: string }) => {
    const registryKey = Symbol.for('openclaw:budget-state-registry');
    const g = globalThis as Record<symbol, unknown>;
    if (!g[registryKey]) g[registryKey] = new Map<string, unknown>();
    (g[registryKey] as Map<string, unknown>).set(state.agentId, state);
  };
  const agentBudgetTrackerDeps = {
    budgetRepo,
    budgetGuardDeps,
    pricingTable,
    generateId,
    now,
    allocations: agentAllocations,
  };
  registerBudgetHooks(api, agentBudgetTrackerDeps, agentConfig.map(a => a.id), budgetStatePublisher);

  // Start decision timeout cron (re-escalates stalled decisions)
  const decisionTimeoutCron = new DecisionTimeoutCron({
    db,
    generateId,
    now,
    logger: api.logger,
    decisionConfig,
  });
  decisionTimeoutCron.start();

  // Start stage timeout cron (escalates stalled pipeline stages AND spawns agents)
  const orchestratorConfig = resolveOrchestratorConfig(pluginConfig);
  const stageTimeoutCron = new StageTimeoutCron({
    db,
    generateId,
    now,
    logger: api.logger,
    orchestratorConfig,
    agentSpawner: sharedSpawnSink,
    sessionCleaner: {
      clearAgentSessions: (agentId) => clearAgentSessions(stateDir, agentId, api.logger),
    },
  });
  stageTimeoutCron.start();

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
