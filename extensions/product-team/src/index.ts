/**
 * OpenClaw Plugin: Product Team Engine
 *
 * Registers task lifecycle, workflow, quality gate, and VCS tools
 * for orchestrating a multi-agent product development team.
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { ulid } from 'ulid';
import { resolve, isAbsolute, relative } from 'node:path';
import type { ServerResponse } from 'node:http';
import { createDatabase } from './persistence/connection.js';
import { runMigrations } from './persistence/migrations.js';
import { SqliteTaskRepository } from './persistence/task-repository.js';
import { SqliteOrchestratorRepository } from './persistence/orchestrator-repository.js';
import { SqliteEventRepository } from './persistence/event-repository.js';
import { SqliteLeaseRepository } from './persistence/lease-repository.js';
import { SqliteRequestRepository } from './persistence/request-repository.js';
import { ALL_STATUSES, type TaskStatus } from './domain/task-status.js';
import { EventLog } from './orchestrator/event-log.js';
import { LeaseManager } from './orchestrator/lease-manager.js';
import { resolveTransitionGuardConfig } from './orchestrator/transition-guards.js';
import { getAllToolDefs } from './tools/index.js';
import { createValidator } from './schemas/validator.js';
import { GhClient } from './github/gh-client.js';
import { BranchService } from './github/branch-service.js';
import { PrService } from './github/pr-service.js';
import { LabelService } from './github/label-service.js';
import { PrBotAutomation, type PrBotConfig } from './github/pr-bot.js';
import {
  CiFeedbackAutomation,
  InvalidJsonPayloadError,
  parseJsonRequestBody,
  RequestBodyTooLargeError,
  readRequestBody,
  type CiFeedbackConfig,
} from './github/ci-feedback.js';
import {
  assertValidGithubWebhookSignature,
  InvalidGithubSignatureError,
  MissingGithubSignatureError,
} from './github/webhook-signature.js';

export type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

interface GithubConfig {
  readonly owner: string;
  readonly repo: string;
  readonly defaultBase: string;
  readonly timeoutMs: number;
  readonly prBot: PrBotConfig;
  readonly ciFeedback: CiFeedbackConfig;
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

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeRoutePath(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return '/webhooks/github/ci';
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function asTaskStatus(value: unknown): TaskStatus | null {
  if (typeof value !== 'string') {
    return null;
  }
  return (ALL_STATUSES as readonly string[]).includes(value) ? value as TaskStatus : null;
}

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return asNonEmptyString(value[0]);
  }
  return asNonEmptyString(value);
}

function writeJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function resolveGithubConfig(pluginConfig: Record<string, unknown> | undefined): GithubConfig {
  const github = asRecord(pluginConfig?.github);
  const prBot = asRecord(github?.prBot);
  const reviewers = asRecord(prBot?.reviewers);
  const ciFeedback = asRecord(github?.ciFeedback);
  const autoTransition = asRecord(ciFeedback?.autoTransition);
  const ciFeedbackEnabled = asBoolean(ciFeedback?.enabled) ?? false;
  const webhookSecret = asNonEmptyString(ciFeedback?.webhookSecret);
  if (ciFeedbackEnabled && !webhookSecret) {
    throw new Error(
      'github.ciFeedback.webhookSecret must be configured when github.ciFeedback.enabled is true',
    );
  }
  const owner = asNonEmptyString(github?.owner) ?? 'local-owner';
  const repo = asNonEmptyString(github?.repo) ?? 'local-repo';
  return {
    owner,
    repo,
    defaultBase: asNonEmptyString(github?.defaultBase) ?? 'main',
    timeoutMs: asPositiveInteger(github?.timeoutMs) ?? 30_000,
    prBot: {
      enabled: typeof prBot?.enabled === 'boolean' ? prBot.enabled : true,
      reviewers: {
        default: asStringArray(reviewers?.default),
        major: asStringArray(reviewers?.major),
        minor: asStringArray(reviewers?.minor),
        patch: asStringArray(reviewers?.patch),
      },
    },
    ciFeedback: {
      enabled: ciFeedbackEnabled,
      routePath: normalizeRoutePath(
        asNonEmptyString(ciFeedback?.routePath) ?? '/webhooks/github/ci',
      ),
      webhookSecret: webhookSecret ?? '',
      expectedRepository: `${owner}/${repo}`,
      commentOnPr: asBoolean(ciFeedback?.commentOnPr) ?? true,
      autoTransition: {
        enabled: asBoolean(autoTransition?.enabled) ?? false,
        toStatus: asTaskStatus(autoTransition?.toStatus),
        agentId: asNonEmptyString(autoTransition?.agentId) ?? 'infra',
      },
    },
  };
}

export function resolveConcurrencyConfig(
  pluginConfig: Record<string, unknown> | undefined,
): ConcurrencyConfig {
  const workflow = asRecord(pluginConfig?.workflow);
  const concurrency = asRecord(workflow?.concurrency);
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

  if (githubConfig.ciFeedback.enabled) {
    api.registerHttpRoute({
      path: githubConfig.ciFeedback.routePath,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          writeJson(res, 405, {
            ok: false,
            error: 'method_not_allowed',
          });
          return;
        }

        const eventName = headerValue(req.headers['x-github-event']);
        if (!eventName) {
          writeJson(res, 400, {
            ok: false,
            error: 'missing_x_github_event_header',
          });
          return;
        }

        try {
          const payloadBytes = await readRequestBody(req);
          const signature = headerValue(req.headers['x-hub-signature-256']);
          assertValidGithubWebhookSignature(
            githubConfig.ciFeedback.webhookSecret,
            payloadBytes,
            signature,
          );
          const payload = parseJsonRequestBody(payloadBytes);
          const deliveryId = headerValue(req.headers['x-github-delivery']);
          const result = await ciFeedbackAutomation.handleGithubWebhook({
            eventName,
            deliveryId,
            payload,
          });

          writeJson(res, result.handled ? 200 : 202, {
            ok: true,
            ...result,
          });
        } catch (error: unknown) {
          const message = String(error);
          api.logger.warn(`ci-feedback webhook failed: ${message}`);
          if (error instanceof RequestBodyTooLargeError) {
            writeJson(res, 413, {
              ok: false,
            error: 'payload_too_large',
          });
          return;
        }
        if (error instanceof MissingGithubSignatureError) {
          writeJson(res, 401, {
            ok: false,
            error: 'missing_x_hub_signature_256_header',
          });
          return;
        }
        if (error instanceof InvalidGithubSignatureError) {
          writeJson(res, 401, {
            ok: false,
            error: 'invalid_x_hub_signature_256',
          });
          return;
        }
        if (error instanceof InvalidJsonPayloadError || error instanceof SyntaxError) {
          writeJson(res, 400, {
            ok: false,
              error: 'invalid_json_payload',
            });
            return;
          }
          writeJson(res, 500, {
            ok: false,
            error: 'ci_feedback_processing_failed',
          });
        }
      },
    });
    api.logger.info(`registered CI webhook route at ${githubConfig.ciFeedback.routePath}`);
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
