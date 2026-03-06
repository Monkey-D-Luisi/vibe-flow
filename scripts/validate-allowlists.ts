import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { register, type OpenClawPluginApi } from '../extensions/product-team/src/index.js';

interface OpenClawConfig {
  readonly agents?: {
    readonly list?: AgentConfig[];
  };
}

interface AgentConfig {
  readonly id: string;
  readonly tools?: {
    readonly allow?: string[];
  };
}

const EXPECTED_TOOLS_BY_AGENT: Record<string, ReadonlySet<string>> = {
  pm: new Set([
    'task_create',
    'task_get',
    'task_search',
    'task_update',
    'task_transition',
    'workflow_events_query',
    'project_list',
    'project_switch',
    'team_assign',
    'team_status',
    'team_message',
    'team_inbox',
    'team_reply',
    'pipeline_start',
    'pipeline_status',
    'pipeline_advance',
    'pipeline_metrics',
    'pipeline_timeline',
    'decision_evaluate',
    'decision_log',
    'decision_outcome',
  ]),
  'tech-lead': new Set([
    'task_create',
    'task_get',
    'task_search',
    'task_update',
    'task_transition',
    'workflow_step_run',
    'workflow_state_get',
    'workflow_events_query',
    'quality_gate',
    'team_assign',
    'team_status',
    'team_message',
    'team_inbox',
    'team_reply',
    'project_list',
    'project_switch',
    'pipeline_status',
    'pipeline_retry',
    'pipeline_skip',
    'pipeline_advance',
    'pipeline_metrics',
    'pipeline_timeline',
    'decision_evaluate',
    'decision_log',
    'decision_outcome',
  ]),
  po: new Set([
    'task_create',
    'task_get',
    'task_search',
    'task_update',
    'task_transition',
    'workflow_step_run',
    'workflow_state_get',
    'team_message',
    'team_inbox',
    'team_reply',
    'team_status',
    'decision_evaluate',
    'decision_log',
    'decision_outcome',
    'pipeline_advance',
  ]),
  designer: new Set([
    'task_get',
    'task_update',
    'task_transition',
    'workflow_step_run',
    'workflow_state_get',
    'team_message',
    'team_inbox',
    'team_reply',
    'decision_evaluate',
    'pipeline_advance',
  ]),
  'back-1': new Set([
    'task_get',
    'task_update',
    'task_transition',
    'workflow_step_run',
    'workflow_state_get',
    'quality_tests',
    'quality_coverage',
    'quality_lint',
    'quality_complexity',
    'quality_gate',
    'team_message',
    'team_inbox',
    'team_reply',
    'decision_evaluate',
    'pipeline_advance',
  ]),
  'front-1': new Set([
    'task_get',
    'task_update',
    'task_transition',
    'workflow_step_run',
    'workflow_state_get',
    'quality_tests',
    'quality_coverage',
    'quality_lint',
    'quality_complexity',
    'quality_gate',
    'team_message',
    'team_inbox',
    'team_reply',
    'decision_evaluate',
    'pipeline_advance',
  ]),
  qa: new Set([
    'task_get',
    'task_update',
    'task_transition',
    'workflow_step_run',
    'workflow_state_get',
    'quality_tests',
    'quality_coverage',
    'quality_lint',
    'quality_complexity',
    'quality_gate',
    'workflow_events_query',
    'team_message',
    'team_inbox',
    'team_reply',
    'decision_evaluate',
    'pipeline_advance',
  ]),
  devops: new Set([
    'vcs_branch_create',
    'vcs_pr_create',
    'vcs_pr_update',
    'vcs_label_sync',
    'task_get',
    'task_search',
    'task_update',
    'task_transition',
    'workflow_state_get',
    'workflow_events_query',
    'project_list',
    'project_switch',
    'team_message',
    'team_inbox',
    'team_reply',
    'pipeline_status',
    'pipeline_advance',
    'decision_evaluate',
  ]),
};

function readConfig(): OpenClawConfig {
  const raw = readFileSync(resolve(process.cwd(), 'openclaw.json'), 'utf-8');
  return JSON.parse(raw) as OpenClawConfig;
}

function collectRegisteredTools(): Set<string> {
  const registeredTools = new Set<string>();

  const api: OpenClawPluginApi = {
    id: 'product-team',
    name: 'Product Team Engine',
    source: 'script',
    config: {} as OpenClawPluginApi['config'],
    pluginConfig: { dbPath: ':memory:' },
    runtime: {} as OpenClawPluginApi['runtime'],
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    },
    registerTool: (tool) => {
      registeredTools.add(tool.name);
    },
    registerHook: () => undefined,
    registerHttpHandler: () => undefined,
    registerHttpRoute: () => undefined,
    registerChannel: () => undefined,
    registerGatewayMethod: () => undefined,
    registerCli: () => undefined,
    registerService: () => undefined,
    registerProvider: () => undefined,
    registerCommand: () => undefined,
    resolvePath: (value) => {
      if (value === ':memory:') {
        return value;
      }
      return resolve(process.cwd(), value);
    },
    on: () => undefined,
  };

  register(api);
  return registeredTools;
}

function validateAgent(
  agent: AgentConfig,
  registeredTools: Set<string>,
): string[] {
  const errors: string[] = [];
  const allow = agent.tools?.allow ?? [];
  const expected = EXPECTED_TOOLS_BY_AGENT[agent.id];

  if (!expected) {
    errors.push(`Agent "${agent.id}" is not defined in validator policy`);
    return errors;
  }

  const seen = new Set<string>();
  for (const tool of allow) {
    if (tool.includes('*')) {
      errors.push(`Agent "${agent.id}" uses wildcard tool "${tool}"`);
      continue;
    }

    if (seen.has(tool)) {
      errors.push(`Agent "${agent.id}" has duplicate tool "${tool}"`);
      continue;
    }
    seen.add(tool);

    if (!registeredTools.has(tool)) {
      errors.push(`Agent "${agent.id}" references unregistered tool "${tool}"`);
    }
    if (!expected.has(tool)) {
      errors.push(`Agent "${agent.id}" is not allowed to use tool "${tool}" by policy`);
    }
  }

  for (const tool of expected) {
    if (!seen.has(tool)) {
      errors.push(`Agent "${agent.id}" is missing required tool "${tool}" from policy`);
    }
  }

  return errors;
}

function run(): void {
  const config = readConfig();
  const agents = config.agents?.list ?? [];
  const registeredTools = collectRegisteredTools();
  const errors: string[] = [];

  const configAgentIds = new Set(agents.map((a) => a.id));
  const policyAgentIds = new Set(Object.keys(EXPECTED_TOOLS_BY_AGENT));

  for (const id of policyAgentIds) {
    if (!configAgentIds.has(id)) {
      errors.push(`Agent "${id}" is defined in validator policy but missing from openclaw.json`);
    }
  }
  for (const id of configAgentIds) {
    if (!policyAgentIds.has(id)) {
      errors.push(`Agent "${id}" is in openclaw.json but not defined in validator policy`);
    }
  }

  for (const agent of agents) {
    errors.push(...validateAgent(agent, registeredTools));
  }

  if (errors.length > 0) {
    console.error('Allow-list validation failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Allow-lists validated for ${agents.length} agents against ${registeredTools.size} tools.`,
  );
}

run();
