import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateName, generateExtension } from '../src/generator.js';
import { VALID_TEMPLATES } from '../src/templates.js';
import type { TemplateType } from '../src/templates.js';

// ---------------------------------------------------------------------------
// validateName
// ---------------------------------------------------------------------------

describe('validateName', () => {
  it('accepts valid single-word names', () => {
    expect(() => validateName('myplugin')).not.toThrow();
  });

  it('accepts valid kebab-case names', () => {
    expect(() => validateName('my-plugin')).not.toThrow();
    expect(() => validateName('my-plugin-v2')).not.toThrow();
    expect(() => validateName('abc123')).not.toThrow();
  });

  it('rejects names with uppercase letters', () => {
    expect(() => validateName('MyPlugin')).toThrow('Invalid extension name');
  });

  it('rejects names with leading hyphens', () => {
    expect(() => validateName('-my-plugin')).toThrow('Invalid extension name');
  });

  it('rejects names with trailing hyphens', () => {
    expect(() => validateName('my-plugin-')).toThrow('Invalid extension name');
  });

  it('rejects names with consecutive hyphens', () => {
    expect(() => validateName('my--plugin')).toThrow('Invalid extension name');
  });

  it('rejects names with underscores', () => {
    expect(() => validateName('my_plugin')).toThrow('Invalid extension name');
  });

  it('rejects names with spaces', () => {
    expect(() => validateName('my plugin')).toThrow('Invalid extension name');
  });

  it('rejects empty string', () => {
    expect(() => validateName('')).toThrow('Invalid extension name');
  });

  it('rejects reserved names', () => {
    expect(() => validateName('node_modules')).toThrow('reserved name');
    expect(() => validateName('src')).toThrow('reserved name');
    expect(() => validateName('dist')).toThrow('reserved name');
    expect(() => validateName('tools')).toThrow('reserved name');
  });
});

// ---------------------------------------------------------------------------
// generateExtension
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  const dir = join(tmpdir(), `oc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('generateExtension', () => {
  let tmpBase: string;
  let targetDir: string;

  beforeEach(() => {
    tmpBase = makeTmpDir();
    targetDir = join(tmpBase, 'my-plugin');
  });

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it('creates all required files for a new extension', () => {
    generateExtension({ name: 'my-plugin', targetDir });

    const expected = [
      'package.json',
      'tsconfig.json',
      '.eslintrc.cjs',
      'vitest.config.ts',
      'openclaw.plugin.json',
      join('src', 'index.ts'),
      join('test', 'index.test.ts'),
      'README.md',
    ];

    for (const file of expected) {
      expect(existsSync(join(targetDir, file)), `${file} should exist`).toBe(true);
    }
  });

  it('generates package.json with correct scope and ESM settings', () => {
    generateExtension({ name: 'my-plugin', targetDir });

    const pkg = JSON.parse(readFileSync(join(targetDir, 'package.json'), 'utf8')) as Record<string, unknown>;

    expect(pkg.name).toBe('@openclaw/my-plugin');
    expect(pkg.type).toBe('module');
    expect(pkg.version).toBe('0.1.0');
  });

  it('generates package.json with expected scripts', () => {
    generateExtension({ name: 'my-plugin', targetDir });
    const pkg = JSON.parse(readFileSync(join(targetDir, 'package.json'), 'utf8')) as Record<string, unknown>;
    const scripts = pkg.scripts as Record<string, string>;

    expect(scripts.test).toBe('vitest run');
    expect(scripts.lint).toContain('eslint');
    expect(scripts.typecheck).toBe('tsc --noEmit');
    expect(scripts.build).toBe('tsc');
  });

  it('generates openclaw.plugin.json with correct id and name', () => {
    generateExtension({ name: 'my-plugin', targetDir });
    const manifest = JSON.parse(
      readFileSync(join(targetDir, 'openclaw.plugin.json'), 'utf8'),
    ) as Record<string, unknown>;

    expect(manifest.id).toBe('my-plugin');
    expect(manifest.name).toBe('my-plugin');
    expect(manifest.version).toBe('0.1.0');
  });

  it('generates src/index.ts with register(api) pattern', () => {
    generateExtension({ name: 'my-plugin', targetDir });
    const src = readFileSync(join(targetDir, 'src', 'index.ts'), 'utf8');

    expect(src).toContain("id: 'my-plugin'");
    expect(src).toContain('register(api');
  });

  it('generates test/index.test.ts referencing the plugin name', () => {
    generateExtension({ name: 'my-plugin', targetDir });
    const test = readFileSync(join(targetDir, 'test', 'index.test.ts'), 'utf8');

    expect(test).toContain("'my-plugin'");
  });

  it('generates README.md with package name', () => {
    generateExtension({ name: 'my-plugin', targetDir });
    const readme = readFileSync(join(targetDir, 'README.md'), 'utf8');

    expect(readme).toContain('@openclaw/my-plugin');
  });

  it('throws when target directory exists and --force is not set', () => {
    mkdirSync(targetDir, { recursive: true });

    expect(() => generateExtension({ name: 'my-plugin', targetDir })).toThrow(
      'already exists',
    );
  });

  it('overwrites when target directory exists and --force is set', () => {
    mkdirSync(targetDir, { recursive: true });

    expect(() =>
      generateExtension({ name: 'my-plugin', targetDir, force: true }),
    ).not.toThrow();

    expect(existsSync(join(targetDir, 'package.json'))).toBe(true);
  });

  it('propagates validateName errors', () => {
    const badDir = join(tmpBase, 'BadName');
    expect(() => generateExtension({ name: 'BadName', targetDir: badDir })).toThrow(
      'Invalid extension name',
    );
  });
});

// ---------------------------------------------------------------------------
// Integration: verify generated file tree
// ---------------------------------------------------------------------------

describe('generateExtension integration', () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it('generates a full scaffold for a fresh extension', () => {
    const name = 'awesome-tool';
    const targetDir = join(tmpBase, name);

    generateExtension({ name, targetDir });

    // Verify directory structure
    expect(existsSync(join(targetDir, 'src'))).toBe(true);
    expect(existsSync(join(targetDir, 'test'))).toBe(true);

    // Verify tsconfig
    const tsconfig = JSON.parse(
      readFileSync(join(targetDir, 'tsconfig.json'), 'utf8'),
    ) as Record<string, unknown>;
    const opts = tsconfig.compilerOptions as Record<string, unknown>;
    expect(opts.strict).toBe(true);
    expect(opts.module).toBe('NodeNext');

    // Verify openclaw plugin metadata
    const pkg = JSON.parse(readFileSync(join(targetDir, 'package.json'), 'utf8')) as Record<string, unknown>;
    const oc = pkg.openclaw as Record<string, unknown>;
    expect(Array.isArray(oc.extensions)).toBe(true);

    // Verify eslint config is CJS
    const eslint = readFileSync(join(targetDir, '.eslintrc.cjs'), 'utf8');
    expect(eslint).toContain('module.exports');
  });
});

// ---------------------------------------------------------------------------
// Template-specific generation
// ---------------------------------------------------------------------------

describe('generateExtension templates', () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it('defaults to hybrid template', () => {
    const targetDir = join(tmpBase, 'my-ext');
    generateExtension({ name: 'my-ext', targetDir });
    const src = readFileSync(join(targetDir, 'src', 'index.ts'), 'utf8');

    expect(src).toContain('registerTool');
    expect(src).toContain("api.on('after_tool_call'");
    expect(src).toContain('registerHttpRoute');
  });

  it.each(VALID_TEMPLATES)('generates valid scaffold for %s template', (template: TemplateType) => {
    const name = `ext-${template}`;
    const targetDir = join(tmpBase, name);
    generateExtension({ name, targetDir, template });

    const src = readFileSync(join(targetDir, 'src', 'index.ts'), 'utf8');
    const test = readFileSync(join(targetDir, 'test', 'index.test.ts'), 'utf8');
    const readme = readFileSync(join(targetDir, 'README.md'), 'utf8');

    expect(src).toContain(`id: '${name}'`);
    expect(src).toContain('register(api');
    expect(test).toContain(`'${name} plugin'`);
    expect(readme).toContain(`**Template:** ${template}`);
  });

  it('tool template registers a tool', () => {
    const targetDir = join(tmpBase, 'my-tool');
    generateExtension({ name: 'my-tool', targetDir, template: 'tool' });
    const src = readFileSync(join(targetDir, 'src', 'index.ts'), 'utf8');

    expect(src).toContain('registerTool');
    expect(src).toContain('my_tool_hello');
    expect(src).not.toContain('registerHttpRoute');
    expect(src).not.toContain('registerService');
  });

  it('hook template registers an event hook', () => {
    const targetDir = join(tmpBase, 'my-hook');
    generateExtension({ name: 'my-hook', targetDir, template: 'hook' });
    const src = readFileSync(join(targetDir, 'src', 'index.ts'), 'utf8');

    expect(src).toContain("api.on('after_tool_call'");
    expect(src).not.toContain('registerTool');
    expect(src).not.toContain('registerHttpRoute');
  });

  it('service template registers a service', () => {
    const targetDir = join(tmpBase, 'my-svc');
    generateExtension({ name: 'my-svc', targetDir, template: 'service' });
    const src = readFileSync(join(targetDir, 'src', 'index.ts'), 'utf8');

    expect(src).toContain('registerService');
    expect(src).toContain('start()');
    expect(src).toContain('stop()');
    expect(src).not.toContain('registerTool');
  });

  it('http template registers an HTTP route', () => {
    const targetDir = join(tmpBase, 'my-api');
    generateExtension({ name: 'my-api', targetDir, template: 'http' });
    const src = readFileSync(join(targetDir, 'src', 'index.ts'), 'utf8');

    expect(src).toContain('registerHttpRoute');
    expect(src).toContain("'/api/my-api'");
    expect(src).not.toContain('registerTool');
    expect(src).not.toContain('registerService');
  });

  it('allows extension names that match template names', () => {
    const targetDir = join(tmpBase, 'tool');
    generateExtension({ name: 'tool', targetDir, template: 'tool' });
    const src = readFileSync(join(targetDir, 'src', 'index.ts'), 'utf8');

    expect(src).toContain("id: 'tool'");
    expect(src).toContain('registerTool');
  });
});
