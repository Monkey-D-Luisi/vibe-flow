import Ajv from 'ajv/dist/2020.js';
import { loadSchema } from '../../../../services/task-mcp/src/utils/loadSchema.js';
import { TaskRepository } from '../../../../services/task-mcp/src/repo/repository.js';
import { evaluateGate, DEFAULT_THRESHOLDS } from '../gate/policy.js';
import { defaultPaths, loadMetricsFromArtifacts, loadMetricsFromTools } from '../gate/sources.js';
import type { GateMetrics, GatePaths, GateResult, GateScope, GateThresholds } from '../gate/types.js';

export interface GateTask {
  id: string;
  scope: GateScope;
}

export interface GateThresholdOverrides extends Partial<GateThresholds> {}

export interface GatePathOverrides extends Partial<GatePaths> {}

export interface GateEnforceInput {
  task: GateTask;
  source?: 'artifacts' | 'tools';
  thresholds?: GateThresholdOverrides;
  paths?: GatePathOverrides;
}

export interface GateDependencies {
  rgrLogCount?: number;
  loadRgrLogCount?: (taskId: string) => Promise<number | undefined>;
}

const ajv = new Ajv({ allErrors: true });
const inputSchema = loadSchema('quality_gate.input.schema.json');
const outputSchema = loadSchema('quality_gate.output.schema.json');
const validateInput = ajv.compile<GateEnforceInput>(inputSchema);
const validateOutput = ajv.compile<GateResult>(outputSchema);

const DEFAULT_DB_ENV = 'QUALITY_GATE_TASK_DB';
const RGR_COUNT_ENV = 'QUALITY_GATE_RGR_COUNT';

function mergeThresholds(overrides?: GateThresholdOverrides): GateThresholds {
  return {
    ...DEFAULT_THRESHOLDS,
    ...(overrides ?? {})
  };
}

async function loadMetrics(source: 'artifacts' | 'tools', paths?: GatePathOverrides): Promise<GateMetrics> {
  if (source === 'tools') {
    return await loadMetricsFromTools();
  }
  const mergedPaths: GatePaths = {
    ...defaultPaths(),
    ...(paths ?? {})
  };
  return await loadMetricsFromArtifacts(mergedPaths);
}

function parseEnvNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return undefined;
}

function resolveTaskRepository(): string | undefined {
  const configured = process.env[DEFAULT_DB_ENV];
  return configured && configured.trim().length > 0 ? configured : undefined;
}

async function loadRgrFromRepository(taskId: string, dbPath?: string): Promise<number | undefined> {
  const path = dbPath ?? resolveTaskRepository();
  if (!path) {
    return undefined;
  }
  try {
    const repo = new TaskRepository(path);
    const record = repo.get(taskId);
    repo.close();
    if (!record) {
      return undefined;
    }
    return record.red_green_refactor_log?.length ?? 0;
  } catch (error) {
    console.warn(`quality.gate_enforce: unable to read task ${taskId} from ${path}: ${(error as Error).message}`);
    return undefined;
  }
}

export async function gateEnforce(input: GateEnforceInput, deps: GateDependencies = {}): Promise<GateResult> {
  if (!validateInput(input)) {
    throw new Error(`Invalid input: ${ajv.errorsText(validateInput.errors)}`);
  }

  const source = input.source ?? 'artifacts';
  const thresholds = mergeThresholds(input.thresholds);
  const metrics = await loadMetrics(source, input.paths);

  let rgrLogCount: number | undefined = deps.rgrLogCount;

  if (rgrLogCount === undefined && deps.loadRgrLogCount) {
    rgrLogCount = await deps.loadRgrLogCount(input.task.id);
  }

  if (rgrLogCount === undefined) {
    const envCount = parseEnvNumber(process.env[RGR_COUNT_ENV]);
    if (envCount !== undefined) {
      rgrLogCount = envCount;
    }
  }

  if (rgrLogCount === undefined) {
    rgrLogCount = await loadRgrFromRepository(input.task.id);
  }

  const result = evaluateGate({
    metrics,
    scope: input.task.scope,
    thresholds,
    rgrLogCount
  });

  if (!validateOutput(result)) {
    throw new Error(`Invalid output: ${ajv.errorsText(validateOutput.errors)}`);
  }

  return result;
}
