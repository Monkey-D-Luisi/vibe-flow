import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RESERVED_NAMES = new Set([
  'node_modules',
  'src',
  'dist',
  'test',
  'tools',
  'packages',
  'extensions',
  'scripts',
  'coverage',
]);

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateName(name: string): void {
  if (RESERVED_NAMES.has(name)) {
    throw new Error(
      `"${name}" is a reserved name and cannot be used as an extension name.`,
    );
  }
  if (!NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid extension name "${name}". ` +
        'Must be kebab-case: lowercase letters and digits separated by hyphens. ' +
        'No leading or trailing hyphens.',
    );
  }
}

export interface GenerateOptions {
  name: string;
  targetDir: string;
  force?: boolean;
}

export function generateExtension({ name, targetDir, force = false }: GenerateOptions): void {
  validateName(name);

  if (existsSync(targetDir) && !force) {
    throw new Error(
      `Directory "${targetDir}" already exists. Use --force to overwrite.`,
    );
  }

  mkdirSync(join(targetDir, 'src'), { recursive: true });
  mkdirSync(join(targetDir, 'test'), { recursive: true });

  writeFileSync(join(targetDir, 'package.json'), renderPackageJson(name));
  writeFileSync(join(targetDir, 'tsconfig.json'), renderTsconfig());
  writeFileSync(join(targetDir, '.eslintrc.cjs'), renderEslintrc());
  writeFileSync(join(targetDir, 'vitest.config.ts'), renderVitestConfig());
  writeFileSync(join(targetDir, 'openclaw.plugin.json'), renderPluginJson(name));
  writeFileSync(join(targetDir, 'src', 'index.ts'), renderSrcIndex(name));
  writeFileSync(join(targetDir, 'test', 'index.test.ts'), renderTestIndex(name));
  writeFileSync(join(targetDir, 'README.md'), renderReadme(name));
}

function renderPackageJson(name: string): string {
  return JSON.stringify(
    {
      name: `@openclaw/${name}`,
      version: '0.1.0',
      type: 'module',
      description: `OpenClaw extension: ${name}`,
      main: 'src/index.ts',
      scripts: {
        test: 'vitest run',
        'test:watch': 'vitest',
        'test:coverage': 'vitest run --coverage',
        lint: 'eslint src/**/*.ts --no-cache',
        typecheck: 'tsc --noEmit',
        build: 'tsc',
      },
      dependencies: {
        openclaw: '2026.2.22-2',
      },
      devDependencies: {
        '@types/node': '^22.5.4',
        '@typescript-eslint/eslint-plugin': '^6.21.0',
        '@typescript-eslint/parser': '^6.21.0',
        '@vitest/coverage-v8': '^3.2.4',
        eslint: '^8.57.1',
        typescript: '^5.7.0',
        vitest: '^3.0.0',
      },
      openclaw: {
        extensions: ['./src/index.ts'],
      },
    },
    null,
    2,
  );
}

function renderTsconfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        lib: ['ES2022'],
        outDir: 'dist',
        rootDir: 'src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist', 'test'],
    },
    null,
    2,
  );
}

function renderEslintrc(): string {
  return `module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
  },
  ignorePatterns: ['dist/', 'coverage/', 'node_modules/'],
};\n`;
}

function renderVitestConfig(): string {
  return `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});\n`;
}

function renderPluginJson(name: string): string {
  return JSON.stringify(
    {
      id: name,
      name,
      version: '0.1.0',
      description: `OpenClaw extension: ${name}`,
    },
    null,
    2,
  );
}

function renderSrcIndex(name: string): string {
  return `import type { Plugin } from 'openclaw';

const plugin: Plugin = {
  name: '${name}',
  version: '0.1.0',
  tools: [],
};

export default plugin;\n`;
}

function renderTestIndex(name: string): string {
  return `import { describe, it, expect } from 'vitest';
import plugin from '../src/index.js';

describe('${name} plugin', () => {
  it('exports a plugin with the correct name', () => {
    expect(plugin.name).toBe('${name}');
  });

  it('exports an empty tools array by default', () => {
    expect(plugin.tools).toEqual([]);
  });
});\n`;
}

function renderReadme(name: string): string {
  return `# @openclaw/${name}

OpenClaw extension: ${name}.

## Installation

\`\`\`bash
pnpm add @openclaw/${name}
\`\`\`

## Usage

Register the plugin in your OpenClaw configuration:

\`\`\`json
{
  "extensions": ["@openclaw/${name}"]
}
\`\`\`

## Development

\`\`\`bash
pnpm test
pnpm lint
pnpm typecheck
\`\`\`
`;
}
