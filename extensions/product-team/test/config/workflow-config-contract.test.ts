import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { resolveConcurrencyConfig } from '../../src/index.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function parseJsonFile(path: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  return requireRecord(parsed, path);
}

function extractFirstJsonCodeBlock(markdown: string): Record<string, unknown> {
  const match = markdown.match(/```json\s*([\s\S]*?)```/i);
  if (!match || !match[1]) {
    throw new Error('docs/runbook.md does not contain a JSON code block');
  }
  const parsed = JSON.parse(match[1]) as unknown;
  return requireRecord(parsed, 'runbook JSON example');
}

function extractRunbookPluginConfig(runbookExample: Record<string, unknown>): Record<string, unknown> {
  const plugins = requireRecord(runbookExample.plugins, 'runbook.plugins');
  const entries = requireRecord(plugins.entries, 'runbook.plugins.entries');
  const productTeamEntry = requireRecord(entries['product-team'], 'runbook.plugins.entries.product-team');
  return requireRecord(productTeamEntry.config, 'runbook.plugins.entries.product-team.config');
}

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_MANIFEST_PATH = resolve(TEST_DIR, '../../openclaw.plugin.json');
const RUNBOOK_PATH = resolve(TEST_DIR, '../../../../docs/runbook.md');

describe('workflow config contract', () => {
  it('documents workflow contract keys in plugin schema', () => {
    const manifest = parseJsonFile(PLUGIN_MANIFEST_PATH);
    const configSchema = requireRecord(manifest.configSchema, 'openclaw.plugin.json configSchema');
    const rootProperties = requireRecord(configSchema.properties, 'configSchema.properties');
    const workflow = requireRecord(rootProperties.workflow, 'configSchema.properties.workflow');
    const workflowProperties = requireRecord(workflow.properties, 'configSchema.properties.workflow.properties');

    expect(workflowProperties).toHaveProperty('transitionGuards');
    expect(workflowProperties).toHaveProperty('concurrency');
    expect(rootProperties).not.toHaveProperty('concurrency');
  });

  it('keeps runbook plugin config valid against openclaw.plugin.json schema', () => {
    const manifest = parseJsonFile(PLUGIN_MANIFEST_PATH);
    const configSchema = requireRecord(manifest.configSchema, 'openclaw.plugin.json configSchema');
    const runbookMarkdown = readFileSync(RUNBOOK_PATH, 'utf8');
    const runbookExample = extractFirstJsonCodeBlock(runbookMarkdown);
    const runbookPluginConfig = extractRunbookPluginConfig(runbookExample);

    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(configSchema);
    const valid = validate(runbookPluginConfig);
    expect(valid, ajv.errorsText(validate.errors, { separator: '\n' })).toBe(true);
  });
});

describe('resolveConcurrencyConfig', () => {
  it('reads workflow.concurrency values', () => {
    const result = resolveConcurrencyConfig({
      workflow: {
        concurrency: {
          maxLeasesPerAgent: 2,
          maxTotalLeases: 4,
        },
      },
      concurrency: {
        maxLeasesPerAgent: 1,
        maxTotalLeases: 1,
      },
    });

    expect(result).toEqual({
      maxLeasesPerAgent: 2,
      maxTotalLeases: 4,
    });
  });

  it('ignores undeclared root-level concurrency keys', () => {
    const result = resolveConcurrencyConfig({
      concurrency: {
        maxLeasesPerAgent: 1,
        maxTotalLeases: 1,
      },
    });

    expect(result).toEqual({
      maxLeasesPerAgent: 3,
      maxTotalLeases: 10,
    });
  });
});
