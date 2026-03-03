/**
 * Auto-spawn hooks for inter-agent messaging and decision escalation.
 *
 * When an agent sends a team_message or escalates a decision, the target agent
 * must run to process the request. The SDK does NOT populate ctx.sessionKey in
 * after_tool_call hooks (it is always undefined), so enqueueSystemEvent cannot
 * be used. Instead, we fire a detached `openclaw agent` subprocess that sends a
 * direct message to the target agent's session via the gateway.
 *
 * These hooks intercept after_tool_call events for team_message and
 * decision_evaluate, then trigger a gateway-routed agent run directly.
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Minimal agent config needed by the hooks. */
export type AgentEntry = { id: string; name: string };

/** Logger interface matching the plugin logger surface. */
export interface AutoSpawnLogger {
  info(msg: string): void;
  warn(msg: string): void;
}

/** Interface for triggering an agent run. */
export interface AgentSpawnSink {
  spawnAgent(agentId: string, message: string): void;
}

/** Dependencies injected into the auto-spawn hooks for testability. */
export interface AutoSpawnDeps {
  agents: ReadonlyArray<AgentEntry>;
  logger: AutoSpawnLogger;
  agentRunner: AgentSpawnSink;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Simple deduplication cache: prevents the same spawn from firing twice
 * when the SDK dispatches after_tool_call from multiple code paths.
 * Entries expire after DEDUP_TTL_MS to avoid unbounded growth.
 */
const DEDUP_TTL_MS = 10_000;
const recentSpawns = new Map<string, number>();

function isDuplicate(key: string): boolean {
  const now = Date.now();
  // Evict expired entries opportunistically
  for (const [k, ts] of recentSpawns) {
    if (now - ts > DEDUP_TTL_MS) recentSpawns.delete(k);
  }
  if (recentSpawns.has(key)) return true;
  recentSpawns.set(key, now);
  return false;
}

/** @internal Exposed for testing only. */
export function resetDedupCache(): void {
  recentSpawns.clear();
}

/**
 * Safely extract `details` (or the result itself) from an after_tool_call event.
 *
 * Returns `null` if the result is missing or not object-shaped, so callers
 * can bail early without repetitive null-checks.
 */
export function extractDetails(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== 'object') return null;
  const obj = result as Record<string, unknown>;
  const details = obj['details'];
  if (details && typeof details === 'object') return details as Record<string, unknown>;
  return obj;
}

/**
 * Build the system-directive text that instructs the LLM to spawn a target agent.
 *
 * @deprecated This directive-based approach relies on enqueueSystemEvent which
 * requires ctx.sessionKey (never populated in after_tool_call). Kept for
 * reference only; use agentRunner.spawnAgent() for actual spawning.
 */
export function buildSpawnDirective(params: {
  targetAgentId: string;
  task: string;
  reason: string;
  priority?: 'high' | 'critical';
}): string {
  const { targetAgentId, task, reason, priority = 'high' } = params;
  const safeTask = task.replace(/"/g, "'");
  return (
    `<system-directive priority="${priority}">\n` +
    `${reason}\n` +
    `You MUST now call the sessions_spawn tool to spawn agent "${targetAgentId}".\n` +
    `Use: sessions_spawn({ agentId: "${targetAgentId}", task: "${safeTask}", mode: "run" })\n` +
    `The spawned agent auto-replies on completion. Do NOT use team_message; do NOT skip this step.\n` +
    `</system-directive>`
  );
}

// ── Hook: team_message ──────────────────────────────────────────────────────

/**
 * Handles the after_tool_call event for team_message.
 *
 * When a message is delivered, fires a detached `openclaw agent` process to
 * run the target agent's turn so it can read and respond to the inbox message.
 *
 * NOTE: ctx.sessionKey is always undefined in after_tool_call — the SDK passes
 * void 0 for both agentId and sessionKey in this hook context. The spawn is
 * therefore unconditional (no session context required).
 */
export function handleTeamMessageAutoSpawn(
  deps: AutoSpawnDeps,
  event: { toolName: string; error?: unknown; result?: unknown; params?: Record<string, unknown> },
  ctx: { agentId?: string; sessionKey?: string },
): void {
  if (event.toolName !== 'team_message') return;
  if (event.error) return;

  const details = extractDetails(event.result);
  if (!details || details['delivered'] !== true) return;

  const toAgent = String(event.params?.['to'] ?? '');
  const messageId = String(details['messageId'] ?? '');
  const subject = String(event.params?.['subject'] ?? 'your message');

  if (!toAgent) return;

  // Deduplicate: the SDK fires after_tool_call from multiple code paths
  const dedupKey = `tm:${messageId}:${toAgent}`;
  if (isDuplicate(dedupKey)) return;

  // Only spawn agents that exist in the team config
  const targetExists = deps.agents.some(a => a.id === toAgent);
  if (!targetExists) {
    deps.logger.warn(
      `team-message-hook: target agent "${toAgent}" not found in config, skipping spawn`,
    );
    return;
  }

  const message =
    `You have a new team message in your inbox (ID: ${messageId}) about: ${subject}. ` +
    `Read your team inbox with team_inbox({ agentId: "${toAgent}" }) and respond.`;

  try {
    deps.agentRunner.spawnAgent(toAgent, message);
    deps.logger.info(
      `team-message-hook: agent turn fired for "${toAgent}" ` +
      `(message: ${messageId}, caller: ${ctx.agentId ?? 'unknown'})`,
    );
  } catch (err: unknown) {
    deps.logger.warn(`team-message-hook: spawnAgent failed: ${String(err)}`);
  }
}

// ── Hook: decision_evaluate escalation ──────────────────────────────────────

/**
 * Handles the after_tool_call event for decision_evaluate.
 *
 * When a decision is escalated to another agent, fires a detached `openclaw
 * agent` process to run the approver's turn so it can review the decision.
 */
export function handleDecisionEscalationAutoSpawn(
  deps: AutoSpawnDeps,
  event: { toolName: string; error?: unknown; result?: unknown; params?: Record<string, unknown> },
  ctx: { agentId?: string; sessionKey?: string },
): void {
  if (event.toolName !== 'decision_evaluate') return;
  if (event.error) return;

  const details = extractDetails(event.result);
  if (!details || details['escalated'] !== true) return;

  const approver = String(details['approver'] ?? 'unknown');
  const decisionId = String(details['decisionId'] ?? 'unknown');
  const nextAction = details['nextAction'] as Record<string, unknown> | undefined;

  deps.logger.info(
    `decision-escalation: Decision ${decisionId} escalated to ${approver} ` +
    `by agent ${ctx.agentId ?? 'unknown'}` +
    (nextAction ? ` — nextAction: spawn_subagent(${String(nextAction['agentId'])})` : ''),
  );

  // Only auto-spawn for non-human approvers that have a nextAction
  if (!nextAction || approver === 'human') return;

  const agentId = String(nextAction['agentId'] ?? approver);
  const task = String(nextAction['task'] ?? `Review escalated decision ${decisionId}`);

  // Deduplicate: the SDK fires after_tool_call from multiple code paths
  const dedupKey = `de:${decisionId}:${agentId}`;
  if (isDuplicate(dedupKey)) return;

  try {
    deps.agentRunner.spawnAgent(agentId, task);
    deps.logger.info(
      `decision-escalation: agent turn fired for "${agentId}" ` +
      `(decision: ${decisionId}, caller: ${ctx.agentId ?? 'unknown'})`,
    );
  } catch (err: unknown) {
    deps.logger.warn(`decision-escalation: spawnAgent failed: ${String(err)}`);
  }
}

// ── Gateway-direct agent trigger ─────────────────────────────────────────────

/**
 * Fire-and-forget agent trigger via a detached Node.js subprocess that opens
 * a raw WebSocket to the gateway and sends the `agent` method with both
 * `agentId` and `sessionKey`.
 *
 * The CLI subprocess approach does NOT work because:
 * - `--agent` alone: gateway rejects with "unknown agent id" during concurrent runs
 * - `--session-id` alone: gateway doesn't resolve agentId → wrong tool config
 * - `--agent` + `--session-id`: still rejected by agent ID validation
 *
 * A raw WS with both params goes through the same code path as Telegram inbound,
 * ensuring the agent gets its plugin tools (team_inbox, team_reply, etc.).
 */
export function fireAgentViaGatewayWs(
  agentId: string,
  message: string,
  logger: AutoSpawnLogger,
): void {
  const port = process.env['OPENCLAW_GATEWAY_PORT'] || '28789';
  const token = process.env['OPENCLAW_GATEWAY_TOKEN'] ?? '';
  const sessionKey = `agent:${agentId}:main`;

  // ESM script using the SDK's GatewayClient directly (NOT callGatewayFromCli).
  // callGatewayFromCli triggers loadConfig() which causes config state changes
  // that reset the gateway's in-memory Telegram bindings.
  //
  // By using GatewayClient + loadOrCreateDeviceIdentity() directly, we get
  // proper device-authenticated WS with full scopes without config side effects.
  //
  // IMPORTANT: Do NOT pass agentId — the gateway's listAgentIds() check
  // rejects known agent IDs during concurrent runs. Instead, pass only
  // sessionKey; the gateway resolves the agent config from the session key
  // via loadSessionEntry(), which sets cfgForAgent and loads plugin tools.
  const agentParams = JSON.stringify({
    sessionKey,
    message,
    idempotencyKey: `auto-spawn:${agentId}:${Date.now()}`,
  });

  const script = `
import { readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Resolve hashed filenames at runtime
const distDir = "/app/node_modules/openclaw/dist/";
const files = readdirSync(distDir);
const clientFile = files.filter(f => f.startsWith("client-") && f.endsWith(".js")).sort()[0];
const callFile = files.filter(f => f.startsWith("call-") && f.endsWith(".js")).sort()[0];

const clientMod = await import(distDir + clientFile);
const callMod = await import(distDir + callFile);

const GatewayClient = clientMod.t;
const PROTOCOL_VERSION = clientMod.kt;
const loadOrCreateDeviceIdentity = clientMod.Xt;
const ADMIN_SCOPE = callMod.s;
const WRITE_SCOPE = "operator.write";
const READ_SCOPE = callMod.c;

const agentParams = ${agentParams};

await new Promise((resolve, reject) => {
  let done = false;
  const finish = (err, val) => { if (done) return; done = true; clearTimeout(timer); err ? reject(err) : resolve(val); };

  const client = new GatewayClient({
    url: "ws://127.0.0.1:${port}",
    token: ${JSON.stringify(token)},
    instanceId: randomUUID(),
    clientName: "cli",
    clientVersion: "1.0.0",
    platform: "linux",
    mode: "cli",
    role: "operator",
    scopes: [ADMIN_SCOPE, READ_SCOPE, WRITE_SCOPE],
    deviceIdentity: loadOrCreateDeviceIdentity(),
    minProtocol: PROTOCOL_VERSION,
    maxProtocol: PROTOCOL_VERSION,
    onHelloOk: async () => {
      try {
        const result = await client.request("agent", agentParams, {});
        client.stop();
        finish(null, result);
      } catch (e) { client.stop(); finish(e); }
    },
    onClose: (code, reason) => { if (!done) { client.stop(); finish(new Error("ws closed: " + code + " " + reason)); } },
    onConnectError: (e) => { if (!done) { client.stop(); finish(e); } },
  });
  const timer = setTimeout(() => { client.stop(); finish(new Error("timeout")); }, 30000);
  client.start();
});
process.exit(0);
`.trim();

  try {
    const child = spawn('node', ['--input-type=module', '-e', script], {
      detached: true,
      stdio: 'ignore',
      cwd: '/app',
      env: { ...process.env, NODE_PATH: '/app/node_modules' },
    });
    child.unref();
  } catch (err: unknown) {
    logger.warn(`auto-spawn: WS subprocess spawn failed for "${agentId}": ${String(err)}`);
  }
}

// ── Session ID resolution ────────────────────────────────────────────────────

/**
 * Resolve the gateway session UUID for a given agent.
 *
 * Reads `<stateDir>/agents/<agentId>/sessions/sessions.json` and extracts the
 * session UUID for the `agent:<agentId>:main` key. Falls back to scanning the
 * directory for `*.jsonl` files if sessions.json is missing.
 */
export function resolveAgentSessionId(
  stateDir: string,
  agentId: string,
  logger?: AutoSpawnLogger,
): string | null {
  const sessionsFile = join(stateDir, 'agents', agentId, 'sessions', 'sessions.json');
  try {
    const raw = readFileSync(sessionsFile, 'utf-8');
    const data = JSON.parse(raw) as Record<string, { sessionId?: string }>;
    const mainKey = `agent:${agentId}:main`;
    const entry = data[mainKey];
    if (entry?.sessionId) return entry.sessionId;
    // Fallback: try any key that contains the agent ID
    for (const [, val] of Object.entries(data)) {
      if (val?.sessionId) return val.sessionId;
    }
  } catch {
    logger?.warn(`auto-spawn: sessions.json not found for "${agentId}", scanning directory`);
  }
  // Fallback: scan for .jsonl session files
  try {
    const sessDir = join(stateDir, 'agents', agentId, 'sessions');
    const files = readdirSync(sessDir).filter(f => f.endsWith('.jsonl'));
    if (files.length > 0) {
      return files[0].replace('.jsonl', '');
    }
  } catch {
    // No sessions directory at all
  }
  return null;
}

// ── Registration helper ─────────────────────────────────────────────────────

/**
 * Register both auto-spawn after_tool_call hooks on the plugin API.
 *
 * @param agentRunner - Optional custom runner for testing. In production,
 *   defaults to a raw WebSocket connection to the gateway that sends the
 *   `agent` method with both `agentId` and `sessionKey` for proper tool resolution.
 */
export function registerAutoSpawnHooks(
  api: OpenClawPluginApi,
  agents: ReadonlyArray<AgentEntry>,
  agentRunner?: AgentSpawnSink,
): void {
  const runner: AgentSpawnSink = agentRunner ?? {
    spawnAgent(agentId: string, message: string): void {
      try {
        fireAgentViaGatewayWs(agentId, message, api.logger);
        api.logger.info(`auto-spawn: WS trigger fired for agent "${agentId}"`);
      } catch (err: unknown) {
        api.logger.warn(`auto-spawn: WS trigger failed for "${agentId}": ${String(err)}`);
      }
    },
  };

  const deps: AutoSpawnDeps = {
    agents,
    logger: api.logger,
    agentRunner: runner,
  };

  api.on('after_tool_call', (_event, _ctx) => {
    try {
      handleTeamMessageAutoSpawn(deps, _event, _ctx);
    } catch (err: unknown) {
      api.logger.warn(`team-message-hook: unhandled error: ${String(err)}`);
    }
  });

  api.on('after_tool_call', (_event, _ctx) => {
    try {
      handleDecisionEscalationAutoSpawn(deps, _event, _ctx);
    } catch (err: unknown) {
      api.logger.warn(`decision-escalation-hook: unhandled error: ${String(err)}`);
    }
  });

  api.logger.info('registered auto-spawn hooks for team_message and decision escalation');
}
