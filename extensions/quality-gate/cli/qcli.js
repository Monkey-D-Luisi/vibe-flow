#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'fs';
import { open } from 'node:fs/promises';
import { dirname } from 'path';
import { runTestsTool } from '../src/tools/run_tests.js';
import { coverageReportTool } from '../src/tools/coverage_report.js';
import { lintTool } from '../src/tools/lint.js';
import { complexityTool } from '../src/tools/complexity.js';
import { gateEnforceTool } from '../src/tools/gate_enforce.js';
import { MAX_JSON_FILE_BYTES } from '@openclaw/quality-contracts/fs/read';
function ensureValue(args, index, flag) {
    const value = args[index];
    if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${flag}`);
    }
    return value;
}
function parseCoverageArgs(args) {
    const options = {};
    for (let i = 2; i < args.length; i += 1) {
        const flag = args[i];
        switch (flag) {
            case '--summary':
                options.summaryPath = ensureValue(args, ++i, '--summary');
                break;
            case '--lcov':
                options.lcovPath = ensureValue(args, ++i, '--lcov');
                break;
            case '--cwd':
                options.cwd = ensureValue(args, ++i, '--cwd');
                break;
            case '--format': {
                const value = ensureValue(args, ++i, '--format');
                if (value !== 'summary' && value !== 'lcov' && value !== 'auto') {
                    throw new Error(`Unsupported coverage format: ${value}`);
                }
                options.format = value;
                break;
            }
            default:
                throw new Error(`Unknown option ${flag}`);
        }
    }
    return options;
}
function parseLintArgs(args) {
    const options = {};
    for (let i = 2; i < args.length; i += 1) {
        const flag = args[i];
        switch (flag) {
            case '--engine': {
                const value = ensureValue(args, ++i, '--engine');
                if (value !== 'eslint' && value !== 'ruff') {
                    throw new Error(`Unsupported lint engine: ${value}`);
                }
                options.engine = value;
                break;
            }
            case '--command':
                options.command = ensureValue(args, ++i, '--command');
                break;
            case '--cwd':
                options.cwd = ensureValue(args, ++i, '--cwd');
                break;
            case '--timeout':
            case '--timeout-ms': {
                const raw = ensureValue(args, ++i, flag);
                const parsed = Number.parseInt(raw, 10);
                if (!Number.isFinite(parsed) || parsed < 1000) {
                    throw new Error(`Invalid timeout value ${raw}`);
                }
                options.timeoutMs = parsed;
                break;
            }
            default:
                throw new Error(`Unknown option ${flag}`);
        }
    }
    return options;
}
function parseComplexityArgs(args) {
    const options = {};
    for (let i = 2; i < args.length; i += 1) {
        const flag = args[i];
        switch (flag) {
            case '--glob':
            case '--globs': {
                const value = ensureValue(args, ++i, flag);
                options.globs = [...(options.globs ?? []), value];
                break;
            }
            case '--exclude': {
                const value = ensureValue(args, ++i, '--exclude');
                options.exclude = [...(options.exclude ?? []), value];
                break;
            }
            case '--cwd':
                options.cwd = ensureValue(args, ++i, '--cwd');
                break;
            case '--max-cyclomatic': {
                const raw = ensureValue(args, ++i, '--max-cyclomatic');
                options.maxCyclomatic = Number.parseInt(raw, 10);
                break;
            }
            case '--top-n': {
                const raw = ensureValue(args, ++i, '--top-n');
                options.topN = Number.parseInt(raw, 10);
                break;
            }
            default:
                throw new Error(`Unknown option ${flag}`);
        }
    }
    return options;
}
const VALID_SCOPES = ['major', 'minor', 'patch', 'default'];
function parsePositiveInteger(raw, flag) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`Invalid ${flag} value "${raw}"`);
    }
    return parsed;
}
function parseZeroToOne(raw, flag) {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new Error(`Invalid ${flag} value "${raw}". Expected a number between 0 and 1`);
    }
    return parsed;
}
function parseNonNegativeNumber(raw, flag) {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid ${flag} value "${raw}". Expected a non-negative number`);
    }
    return parsed;
}
async function readHistoryFile(path) {
    const fileHandle = await open(path, 'r');
    let content;
    try {
        const fileStat = await fileHandle.stat();
        if (fileStat.size > MAX_JSON_FILE_BYTES) {
            throw new Error(`FILE_TOO_LARGE: History file at ${path} exceeds ${MAX_JSON_FILE_BYTES} bytes`);
        }
        content = await fileHandle.readFile('utf8');
    }
    finally {
        await fileHandle.close();
    }
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
        throw new Error(`History file "${path}" must contain a JSON array`);
    }
    return parsed.map((entry, index) => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            throw new Error(`History entry at index ${index} must be an object`);
        }
        const record = entry;
        const sample = {};
        if (typeof record.coveragePct === 'number' && Number.isFinite(record.coveragePct)) {
            sample.coveragePct = record.coveragePct;
        }
        if (typeof record.lintWarnings === 'number' && Number.isFinite(record.lintWarnings)) {
            sample.lintWarnings = record.lintWarnings;
        }
        if (typeof record.maxCyclomatic === 'number' && Number.isFinite(record.maxCyclomatic)) {
            sample.maxCyclomatic = record.maxCyclomatic;
        }
        if (typeof record.scope === 'string') {
            sample.scope = record.scope;
        }
        if (typeof record.timestamp === 'string') {
            sample.timestamp = record.timestamp;
        }
        if (Array.isArray(record.alertKeys)) {
            sample.alertKeys = record.alertKeys
                .filter((value) => typeof value === 'string' && value.length > 0);
        }
        return sample;
    });
}
async function parseGateArgs(args) {
    const input = {};
    for (let i = 2; i < args.length; i += 1) {
        const flag = args[i];
        switch (flag) {
            case '--scope': {
                const value = ensureValue(args, ++i, '--scope');
                if (!VALID_SCOPES.includes(value)) {
                    throw new Error(`Invalid scope "${value}". Valid scopes: ${VALID_SCOPES.join(', ')}`);
                }
                input.scope = value;
                break;
            }
            case '--auto-tune':
                input.autoTune = { ...(input.autoTune ?? {}), enabled: true };
                break;
            case '--history': {
                const value = ensureValue(args, ++i, '--history');
                input.history = await readHistoryFile(value);
                input.autoTune = { ...(input.autoTune ?? {}), enabled: true };
                break;
            }
            case '--min-samples': {
                const value = ensureValue(args, ++i, '--min-samples');
                input.autoTune = {
                    ...(input.autoTune ?? {}),
                    enabled: true,
                    minSamples: parsePositiveInteger(value, '--min-samples'),
                };
                break;
            }
            case '--smoothing-factor': {
                const value = ensureValue(args, ++i, '--smoothing-factor');
                input.autoTune = {
                    ...(input.autoTune ?? {}),
                    enabled: true,
                    smoothingFactor: parseZeroToOne(value, '--smoothing-factor'),
                };
                break;
            }
            case '--alerts':
                input.alerts = { ...(input.alerts ?? {}), enabled: true };
                break;
            case '--coverage-drop-threshold': {
                const value = ensureValue(args, ++i, '--coverage-drop-threshold');
                input.alerts = {
                    ...(input.alerts ?? {}),
                    enabled: true,
                    thresholds: {
                        ...(input.alerts?.thresholds ?? {}),
                        coverageDropPct: parseNonNegativeNumber(value, '--coverage-drop-threshold'),
                    },
                };
                break;
            }
            case '--complexity-rise-threshold': {
                const value = ensureValue(args, ++i, '--complexity-rise-threshold');
                input.alerts = {
                    ...(input.alerts ?? {}),
                    enabled: true,
                    thresholds: {
                        ...(input.alerts?.thresholds ?? {}),
                        complexityRise: parseNonNegativeNumber(value, '--complexity-rise-threshold'),
                    },
                };
                break;
            }
            case '--alert-cooldown-events': {
                const value = ensureValue(args, ++i, '--alert-cooldown-events');
                input.alerts = {
                    ...(input.alerts ?? {}),
                    enabled: true,
                    noise: {
                        ...(input.alerts?.noise ?? {}),
                        cooldownEvents: parsePositiveInteger(value, '--alert-cooldown-events'),
                    },
                };
                break;
            }
            default:
                throw new Error(`Unknown option ${flag}`);
        }
    }
    return input;
}
function usage() {
    console.log(`Usage:
  qcli run --tests
  qcli run --coverage [--summary <path>] [--lcov <path>] [--cwd <path>] [--format <summary|lcov|auto>]
  qcli run --lint [--engine <eslint|ruff>] [--command <cmd>] [--cwd <path>] [--timeout <ms>]
  qcli run --complexity [--glob <pattern>]... [--exclude <glob>] [--cwd <path>] [--max-cyclomatic <num>] [--top-n <num>]
  qcli run --gate [--scope <major|minor|patch|default>] [--auto-tune] [--history <path>] [--min-samples <n>] [--smoothing-factor <0-1>] [--alerts] [--coverage-drop-threshold <n>] [--complexity-rise-threshold <n>] [--alert-cooldown-events <n>]`);
    process.exit(1);
}
function writeReport(outputPath, data) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`Report saved to ${outputPath}`);
}
async function main() {
    const args = process.argv.slice(2);
    if (args[0] !== 'run') {
        usage();
    }
    try {
        if (args[1] === '--tests') {
            const result = await runTestsTool({});
            writeReport('.qreport/tests.json', result);
            process.exit(result.exitCode);
        }
        else if (args[1] === '--coverage') {
            const options = parseCoverageArgs(args);
            const result = await coverageReportTool(options);
            writeReport('.qreport/coverage.json', result);
            process.exit(0);
        }
        else if (args[1] === '--lint') {
            const options = parseLintArgs(args);
            const result = await lintTool(options);
            writeReport('.qreport/lint.json', result);
            process.exit(result.totalErrors > 0 ? 1 : 0);
        }
        else if (args[1] === '--complexity') {
            const options = parseComplexityArgs(args);
            const result = await complexityTool(options);
            writeReport('.qreport/complexity.json', result);
            process.exit(result.thresholdExceeded ? 1 : 0);
        }
        else if (args[1] === '--gate') {
            const input = await parseGateArgs(args);
            const result = await gateEnforceTool(input);
            writeReport('.qreport/gate.json', result);
            if (result.result.verdict === 'fail') {
                console.error(`Gate FAILED: ${result.result.summary}`);
                process.exit(1);
            }
            console.log(`Gate ${result.result.verdict.toUpperCase()}: ${result.result.summary}`);
            process.exit(0);
        }
        else {
            usage();
        }
    }
    catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
}
main();
