/**
 * Tool: qgate.tests
 *
 * Runs test suite and reports results.
 */
import { safeSpawn, assertSafeCommand, parseCommand } from '@openclaw/quality-contracts/exec/spawn';
import { assertOptionalString, assertOptionalStringEnum, assertOptionalNumber } from '@openclaw/quality-contracts/validate/tools';
import { parseVitestOutput } from '../parsers/vitest.js';
const DEFAULT_COMMAND = 'pnpm vitest run --reporter=json';
const ENV_ALLOW = ['PATH', 'Path', 'NODE_ENV', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'CI'];
/**
 * Execute test runner tool.
 */
export async function runTestsTool(input) {
    const command = input.command || DEFAULT_COMMAND;
    const cwd = input.cwd || process.cwd();
    const timeoutMs = input.timeoutMs || 300000;
    const reporter = input.reporter || 'vitest';
    const { cmd, args } = parseCommand(command);
    assertSafeCommand(cmd, args);
    const result = await safeSpawn(cmd, args, {
        cwd,
        timeoutMs,
        envAllow: ENV_ALLOW,
    });
    if (result.timedOut) {
        const timeoutDetail = result.stderr.trim();
        return {
            command,
            success: false,
            exitCode: result.exitCode,
            durationMs: result.durationMs,
            timedOut: true,
            stderr: timeoutDetail ? `Test execution timed out: ${timeoutDetail}` : 'Test execution timed out',
        };
    }
    // Try to parse Vitest JSON output
    let summary;
    if (reporter === 'vitest') {
        const stdout = result.stdout.trim();
        // Find JSON in output (vitest may include non-JSON text before/after)
        const jsonStart = stdout.indexOf('{');
        if (jsonStart >= 0) {
            const jsonContent = stdout.slice(jsonStart);
            try {
                summary = parseVitestOutput(jsonContent);
            }
            catch {
                // Fall through to raw output
            }
        }
    }
    const success = result.exitCode === 0 && (summary ? summary.success : true);
    return {
        command,
        success,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        timedOut: false,
        summary,
        stdout: summary ? undefined : result.stdout,
        stderr: result.stderr || undefined,
    };
}
/**
 * Tool definition for registration.
 */
export const runTestsToolDef = {
    name: 'qgate.tests',
    description: 'Run test suite and report results in structured format',
    parameters: {
        type: 'object',
        properties: {
            command: {
                type: 'string',
                description: 'Test command to run',
                default: DEFAULT_COMMAND,
            },
            cwd: {
                type: 'string',
                description: 'Working directory',
            },
            timeoutMs: {
                type: 'number',
                description: 'Timeout in milliseconds',
                default: 300000,
            },
            reporter: {
                type: 'string',
                enum: ['vitest', 'raw'],
                description: 'Test reporter format to parse',
                default: 'vitest',
            },
        },
        additionalProperties: false,
    },
    execute: async (_id, params) => {
        assertOptionalString(params['command'], 'command');
        assertOptionalString(params['cwd'], 'cwd');
        assertOptionalNumber(params['timeoutMs'], 'timeoutMs');
        assertOptionalStringEnum(params['reporter'], 'reporter', ['vitest', 'raw']);
        return runTestsTool(params);
    },
};
