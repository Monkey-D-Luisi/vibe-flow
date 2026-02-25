import type { ToolDef, ToolDeps } from './index.js';
import {
  QualityTestsParams,
  type QualityTestsParams as QualityTestsParamsType,
} from '../schemas/quality-tests.schema.js';
import { parseVitestOutput } from '../quality/parsers/vitest.js';
import { assertSafeCommand, parseCommand, safeSpawn } from '../exec/spawn.js';
import {
  beginQualityExecution,
  getTaskOrThrow,
  resolveWorkingDir,
  updateTaskMetadata,
} from './quality-tool-common.js';
import { mergeQaReport } from './quality-metadata.js';

const DEFAULT_COMMAND = 'pnpm --filter @openclaw/plugin-product-team test -- --reporter=json';
const DEFAULT_TIMEOUT_MS = 120_000;
const ENV_ALLOW = ['NODE_ENV', 'PATH', 'Path', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'CI'];

interface QualityTestsOutput {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  failedTests?: string[];
  meta: {
    runner: string;
    cmd: string;
    cwd: string;
    exitCode: number;
  };
}

function extractJsonPayload(output: string): string {
  const trimmed = output.trim();
  const start = trimmed.indexOf('{');
  if (start >= 0) {
    return trimmed.slice(start);
  }
  return trimmed;
}

export function qualityTestsToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'quality.tests',
    label: 'Run Tests',
    description: 'Run test suite, persist qa_report, and record quality evidence',
    parameters: QualityTestsParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<QualityTestsParamsType>(QualityTestsParams, params);
      const task = getTaskOrThrow(deps, input.taskId);
      const execCtx = beginQualityExecution(deps, input.taskId, input.agentId);
      const command = input.command ?? DEFAULT_COMMAND;
      const cwd = resolveWorkingDir(deps, input.workingDir);
      const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const { cmd, args } = parseCommand(command);
      assertSafeCommand(cmd, args);
      execCtx.logger.info('quality.tests.start', { cmd: command, cwd, timeoutMs });

      const spawnResult = await safeSpawn(cmd, args, {
        cwd,
        timeoutMs,
        envAllow: ENV_ALLOW,
      });

      let output: QualityTestsOutput;
      let qaReport: Record<string, unknown>;
      if (spawnResult.timedOut) {
        output = {
          total: 0,
          passed: 0,
          failed: 1,
          durationMs: spawnResult.durationMs,
          failedTests: ['timed out'],
          meta: {
            runner: 'vitest',
            cmd: command,
            cwd,
            exitCode: spawnResult.exitCode,
          },
        };
        qaReport = {
          total: 0,
          passed: 0,
          failed: 1,
          skipped: 0,
          evidence: [`Timed out after ${timeoutMs}ms`],
        };
      } else {
        const parsed = parseVitestOutput(extractJsonPayload(spawnResult.stdout));
        const failedTests = parsed.files
          .flatMap((file) => file.tests)
          .filter((test) => test.status === 'failed')
          .map((test) => test.name);
        output = {
          total: parsed.totalTests,
          passed: parsed.passed,
          failed: parsed.failed,
          durationMs: spawnResult.durationMs,
          failedTests: failedTests.length > 0 ? failedTests : undefined,
          meta: {
            runner: 'vitest',
            cmd: command,
            cwd,
            exitCode: spawnResult.exitCode,
          },
        };
        qaReport = {
          total: parsed.totalTests,
          passed: parsed.passed,
          failed: parsed.failed,
          skipped: parsed.skipped,
          evidence: failedTests.length > 0
            ? failedTests.map((name) => `failed: ${name}`)
            : ['all tests passed'],
        };
      }

      const metadata = mergeQaReport(task.metadata, qaReport, output as unknown as Record<string, unknown>);
      const updatedTask = updateTaskMetadata(deps, task.id, input.rev, metadata);
      deps.eventLog.logQualityEvent(
        task.id,
        'quality.tests',
        input.agentId,
        execCtx.correlationId,
        {
          durationMs: spawnResult.durationMs,
          failed: output.failed,
          exitCode: output.meta.exitCode,
        },
      );
      execCtx.logger.info('quality.tests.complete', {
        durationMs: Date.now() - execCtx.startedAt,
        failed: output.failed,
      });

      const result = { task: updatedTask, output };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
