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
    'task.create',
    'task.get',
    'task.search',
    'task.update',
    'task.transition',
  ]),
  architect: new Set([
    'task.get',
    'task.update',
    'task.transition',
    'workflow.state.get',
  ]),
  dev: new Set([
    'task.get',
    'task.update',
    'task.transition',
    'quality.tests',
    'quality.coverage',
    'quality.lint',
    'quality.complexity',
    'quality.gate',
    'workflow.step.run',
    'workflow.state.get',
  ]),
  qa: new Set([
    'task.get',
    'task.update',
    'task.transition',
    'quality.tests',
    'quality.coverage',
    'quality.lint',
    'quality.complexity',
  ]),
  reviewer: new Set([
    'task.get',
    'task.update',
    'task.transition',
  ]),
  infra: new Set([
    'vcs.branch.create',
    'vcs.pr.create',
    'vcs.pr.update',
    'vcs.label.sync',
    'task.get',
    'task.search',
    'workflow.state.get',
    'workflow.events.query',
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
