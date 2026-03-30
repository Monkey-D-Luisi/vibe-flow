import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateProjectName, generateProject, renderGitignore, renderEnvFile } from '../src/generator.js';
import type { GenerateOptions, DetectedProviders } from '../src/types.js';

describe('validateProjectName', () => {
  it('accepts valid names', () => {
    expect(validateProjectName('my-app')).toBeNull();
    expect(validateProjectName('my-project-123')).toBeNull();
    expect(validateProjectName('app')).toBeNull();
    expect(validateProjectName('a')).toBeNull();
  });

  it('rejects empty name', () => {
    expect(validateProjectName('')).not.toBeNull();
    expect(validateProjectName('  ')).not.toBeNull();
  });

  it('rejects names starting with dot', () => {
    expect(validateProjectName('.hidden')).not.toBeNull();
  });

  it('rejects names starting with underscore', () => {
    expect(validateProjectName('_private')).not.toBeNull();
  });

  it('rejects uppercase names', () => {
    expect(validateProjectName('MyApp')).not.toBeNull();
  });

  it('rejects names with spaces', () => {
    expect(validateProjectName('my app')).not.toBeNull();
  });

  it('rejects names longer than 214 chars', () => {
    expect(validateProjectName('a'.repeat(215))).not.toBeNull();
  });
});

describe('generateProject', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cvf-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeOptions(overrides?: Partial<GenerateOptions>): GenerateOptions {
    return {
      projectName: 'test-project',
      projectDir: join(tmpDir, 'test-project'),
      team: 'minimal',
      model: 'free',
      type: 'webapp',
      playground: false,
      force: false,
      ...overrides,
    };
  }

  const defaultProviders: DetectedProviders = {
    hasAnthropic: false,
    hasOpenAI: false,
    hasGithubCopilot: true,
  };

  it('creates project directory with required files', () => {
    const options = makeOptions();
    generateProject(options, defaultProviders);

    expect(existsSync(join(options.projectDir, 'package.json'))).toBe(true);
    expect(existsSync(join(options.projectDir, 'openclaw.json'))).toBe(true);
    expect(existsSync(join(options.projectDir, '.env'))).toBe(true);
    expect(existsSync(join(options.projectDir, '.gitignore'))).toBe(true);
    expect(existsSync(join(options.projectDir, 'README.md'))).toBe(true);
    expect(existsSync(join(options.projectDir, 'scripts', 'start.sh'))).toBe(true);
    expect(existsSync(join(options.projectDir, 'scripts', 'start.ps1'))).toBe(true);
  });

  it('generates valid JSON in package.json', () => {
    const options = makeOptions();
    generateProject(options, defaultProviders);

    const pkg = JSON.parse(readFileSync(join(options.projectDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('test-project');
    expect(pkg.dependencies).toBeDefined();
  });

  it('generates valid JSON in openclaw.json', () => {
    const options = makeOptions();
    generateProject(options, defaultProviders);

    const config = JSON.parse(readFileSync(join(options.projectDir, 'openclaw.json'), 'utf-8'));
    expect(config.agents).toBeDefined();
    expect(Array.isArray(config.agents)).toBe(true);
    expect(config.extensions).toBeDefined();
  });

  it('generates minimal team config with 2 agents', () => {
    const options = makeOptions({ team: 'minimal' });
    generateProject(options, defaultProviders);

    const config = JSON.parse(readFileSync(join(options.projectDir, 'openclaw.json'), 'utf-8'));
    expect(config.agents).toHaveLength(2);
    expect(config.agents.map((a: { id: string }) => a.id)).toEqual(['dev', 'qa']);
  });

  it('generates full team config with 8 agents', () => {
    const options = makeOptions({ team: 'full' });
    generateProject(options, defaultProviders);

    const config = JSON.parse(readFileSync(join(options.projectDir, 'openclaw.json'), 'utf-8'));
    expect(config.agents.length).toBe(8);
  });

  it('disables model router for free tier', () => {
    const options = makeOptions({ model: 'free' });
    generateProject(options, defaultProviders);

    const config = JSON.parse(readFileSync(join(options.projectDir, 'openclaw.json'), 'utf-8'));
    expect(config.extensions['@openclaw/model-router']).toBeUndefined();
  });

  it('enables model router for mixed tier', () => {
    const options = makeOptions({ model: 'mixed' });
    generateProject(options, { hasAnthropic: true, hasOpenAI: false, hasGithubCopilot: true });

    const config = JSON.parse(readFileSync(join(options.projectDir, 'openclaw.json'), 'utf-8'));
    expect(config.extensions['@openclaw/model-router']).toBeDefined();
  });

  it('throws if directory exists without --force', () => {
    const options = makeOptions();
    generateProject(options, defaultProviders);
    expect(() => generateProject(options, defaultProviders)).toThrow(/already exists/);
  });

  it('overwrites with --force', () => {
    const options = makeOptions({ force: true });
    generateProject(options, defaultProviders);
    expect(() => generateProject(options, defaultProviders)).not.toThrow();
  });

  it('includes minimal pipeline stages in config', () => {
    const options = makeOptions({ team: 'minimal' });
    generateProject(options, defaultProviders);

    const config = JSON.parse(readFileSync(join(options.projectDir, 'openclaw.json'), 'utf-8'));
    const orchestrator = config.extensions['@openclaw/product-team'].orchestrator;
    expect(orchestrator.pipelineStages).toEqual(['IDEA', 'DECOMPOSITION', 'IMPLEMENTATION', 'QA', 'DONE']);
    expect(orchestrator.escalationTarget).toBe('dev');
  });
});

describe('renderGitignore', () => {
  it('includes node_modules and .env', () => {
    const gitignore = renderGitignore();
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('.env');
  });
});

describe('renderEnvFile', () => {
  it('includes placeholder for missing keys', () => {
    const env = renderEnvFile({ hasAnthropic: false, hasOpenAI: false, hasGithubCopilot: true });
    expect(env).toContain('# ANTHROPIC_API_KEY=');
    expect(env).toContain('# OPENAI_API_KEY=');
  });
});
