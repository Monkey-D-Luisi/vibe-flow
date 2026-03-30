import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { GenerateOptions, DetectedProviders } from '../src/types.js';
import { generatePlayground } from '../src/playground.js';
import { upgradePlayground } from '../src/upgrade.js';
import { renderPlaygroundConfig } from '../src/templates/playground-config.js';

const noProviders: DetectedProviders = { hasAnthropic: false, hasOpenAI: false, hasGithubCopilot: true };

function makeDir(): string {
  const dir = join(tmpdir(), `cvf-playground-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeOptions(projectDir: string, overrides?: Partial<GenerateOptions>): GenerateOptions {
  return {
    projectName: 'test-playground',
    projectDir,
    team: 'minimal',
    model: 'free',
    type: 'webapp',
    playground: true,
    force: false,
    ...overrides,
  };
}

describe('generatePlayground', () => {
  let tmpBase: string;
  let projectDir: string;

  beforeEach(() => {
    tmpBase = makeDir();
    projectDir = join(tmpBase, 'test-playground');
  });

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it('creates project directory with expected files', () => {
    generatePlayground(makeOptions(projectDir), noProviders);
    expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
    expect(existsSync(join(projectDir, 'openclaw.json'))).toBe(true);
    expect(existsSync(join(projectDir, '.env'))).toBe(true);
    expect(existsSync(join(projectDir, 'README.md'))).toBe(true);
    expect(existsSync(join(projectDir, 'scripts', 'start.sh'))).toBe(true);
    expect(existsSync(join(projectDir, 'scripts', 'start.ps1'))).toBe(true);
  });

  it('creates output directory', () => {
    generatePlayground(makeOptions(projectDir), noProviders);
    expect(existsSync(join(projectDir, 'output'))).toBe(true);
  });

  it('does not create .gitignore in playground mode', () => {
    generatePlayground(makeOptions(projectDir), noProviders);
    expect(existsSync(join(projectDir, '.gitignore'))).toBe(false);
  });

  it('openclaw.json has playground flag enabled', () => {
    generatePlayground(makeOptions(projectDir), noProviders);
    const config = JSON.parse(readFileSync(join(projectDir, 'openclaw.json'), 'utf-8'));
    expect(config.playground.enabled).toBe(true);
    expect(config.playground.vcs).toBe(false);
    expect(config.playground.docker).toBe(false);
    expect(config.playground.outputDir).toBe('./output');
  });

  it('openclaw.json uses 4-stage pipeline', () => {
    generatePlayground(makeOptions(projectDir), noProviders);
    const config = JSON.parse(readFileSync(join(projectDir, 'openclaw.json'), 'utf-8'));
    const orch = config.extensions['@openclaw/product-team'].orchestrator;
    expect(orch.pipelineStages).toEqual(['IDEA', 'IMPLEMENTATION', 'QA', 'DONE']);
    expect(orch.database).toBe(':memory:');
  });

  it('openclaw.json uses in-memory database', () => {
    generatePlayground(makeOptions(projectDir), noProviders);
    const config = JSON.parse(readFileSync(join(projectDir, 'openclaw.json'), 'utf-8'));
    expect(config.extensions['@openclaw/product-team'].orchestrator.database).toBe(':memory:');
  });

  it('README mentions playground mode', () => {
    generatePlayground(makeOptions(projectDir), noProviders);
    const readme = readFileSync(join(projectDir, 'README.md'), 'utf-8');
    expect(readme).toContain('Playground');
    expect(readme).toContain('no Git');
  });

  it('throws when directory exists and force is false', () => {
    mkdirSync(projectDir, { recursive: true });
    expect(() => generatePlayground(makeOptions(projectDir), noProviders)).toThrow('already exists');
  });

  it('overwrites when force is true', () => {
    mkdirSync(projectDir, { recursive: true });
    generatePlayground(makeOptions(projectDir, { force: true }), noProviders);
    expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
  });
});

describe('renderPlaygroundConfig', () => {
  it('returns valid JSON', () => {
    const options = makeOptions('/tmp/test');
    const config = JSON.parse(renderPlaygroundConfig(options));
    expect(config.playground.enabled).toBe(true);
  });

  it('includes playground section', () => {
    const options = makeOptions('/tmp/test');
    const config = JSON.parse(renderPlaygroundConfig(options));
    expect(config.playground).toEqual({
      enabled: true,
      outputDir: './output',
      vcs: false,
      docker: false,
    });
  });
});

describe('upgradePlayground', () => {
  let tmpBase: string;
  let projectDir: string;

  beforeEach(() => {
    tmpBase = makeDir();
    projectDir = join(tmpBase, 'test-upgrade');
    // Create a playground project
    generatePlayground(makeOptions(projectDir), noProviders);
  });

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it('upgrades a playground project', () => {
    const result = upgradePlayground(projectDir);
    expect(result.upgraded).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('removes playground flag from config', () => {
    upgradePlayground(projectDir);
    const config = JSON.parse(readFileSync(join(projectDir, 'openclaw.json'), 'utf-8'));
    expect(config.playground).toBeUndefined();
  });

  it('removes in-memory database setting', () => {
    upgradePlayground(projectDir);
    const config = JSON.parse(readFileSync(join(projectDir, 'openclaw.json'), 'utf-8'));
    const orch = config.extensions['@openclaw/product-team'].orchestrator;
    expect(orch.database).toBeUndefined();
  });

  it('removes custom pipeline settings (reverts to defaults)', () => {
    upgradePlayground(projectDir);
    const config = JSON.parse(readFileSync(join(projectDir, 'openclaw.json'), 'utf-8'));
    const orch = config.extensions['@openclaw/product-team'].orchestrator;
    expect(orch.pipelineStages).toBeUndefined();
    expect(orch.stageOwners).toBeUndefined();
    expect(orch.coordinatorAgents).toBeUndefined();
    expect(orch.escalationTarget).toBeUndefined();
  });

  it('creates .gitignore', () => {
    upgradePlayground(projectDir);
    expect(existsSync(join(projectDir, '.gitignore'))).toBe(true);
  });

  it('fails for non-existent directory', () => {
    const result = upgradePlayground(join(tmpBase, 'non-existent'));
    expect(result.upgraded).toBe(false);
    expect(result.errors).toContain('No openclaw.json found — not a vibe-flow project');
  });

  it('fails for non-playground project', () => {
    // Overwrite with a non-playground config
    const configPath = join(projectDir, 'openclaw.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    delete config.playground;
    writeFileSync(configPath, JSON.stringify(config));

    const result = upgradePlayground(projectDir);
    expect(result.upgraded).toBe(false);
    expect(result.errors[0]).toContain('not in playground mode');
  });

  it('fails for invalid JSON', () => {
    writeFileSync(join(projectDir, 'openclaw.json'), 'not json');
    const result = upgradePlayground(projectDir);
    expect(result.upgraded).toBe(false);
    expect(result.errors[0]).toContain('Could not parse');
  });
});
