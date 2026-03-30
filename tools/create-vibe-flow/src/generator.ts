/**
 * Project Generator (EP30 Task 0191)
 *
 * Validates project name and generates a complete vibe-flow project directory.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GenerateOptions } from './types.js';
import { renderPackageJson } from './templates/package-json.js';
import { renderGatewayConfig } from './templates/gateway-config.js';
import { renderStartSh, renderStartPs1 } from './templates/start-script.js';
import { renderReadme } from './templates/readme.js';
import type { DetectedProviders } from './types.js';

const PROJECT_NAME_RE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

export function validateProjectName(name: string): string | null {
  if (!name || name.trim().length === 0) {
    return 'Project name is required';
  }
  if (name.length > 214) {
    return 'Project name must be 214 characters or fewer';
  }
  if (!PROJECT_NAME_RE.test(name)) {
    return 'Project name must be lowercase alphanumeric with hyphens, dots, or underscores';
  }
  if (name.startsWith('.') || name.startsWith('_')) {
    return 'Project name cannot start with a dot or underscore';
  }
  return null;
}

export function renderEnvFile(providers: DetectedProviders): string {
  const lines = [
    '# API Keys (auto-detected by create-vibe-flow)',
    '# Add your keys below to upgrade model quality.',
    '',
  ];
  if (providers.hasAnthropic) {
    lines.push(`ANTHROPIC_API_KEY=${process.env['ANTHROPIC_API_KEY'] ?? ''}`);
  } else {
    lines.push('# ANTHROPIC_API_KEY=sk-ant-...');
  }
  if (providers.hasOpenAI) {
    lines.push(`OPENAI_API_KEY=${process.env['OPENAI_API_KEY'] ?? ''}`);
  } else {
    lines.push('# OPENAI_API_KEY=sk-...');
  }
  lines.push('');
  return lines.join('\n');
}

export function renderGitignore(): string {
  return `node_modules/
dist/
.env
.env.local
*.log
.openclaw/
output/
`;
}

export function generateProject(options: GenerateOptions, providers: DetectedProviders): void {
  const { projectDir, force } = options;

  if (existsSync(projectDir) && !force) {
    throw new Error(`Directory "${projectDir}" already exists. Use --force to overwrite.`);
  }

  // Create directory structure
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(join(projectDir, 'scripts'), { recursive: true });

  // Write files
  writeFileSync(join(projectDir, 'package.json'), renderPackageJson(options));
  writeFileSync(join(projectDir, 'openclaw.json'), renderGatewayConfig(options));
  writeFileSync(join(projectDir, '.env'), renderEnvFile(providers));
  writeFileSync(join(projectDir, '.gitignore'), renderGitignore());
  writeFileSync(join(projectDir, 'README.md'), renderReadme(options));
  writeFileSync(join(projectDir, 'scripts', 'start.sh'), renderStartSh(options.projectName), { mode: 0o755 });
  writeFileSync(join(projectDir, 'scripts', 'start.ps1'), renderStartPs1(options.projectName));
}
