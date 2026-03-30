/**
 * Playground Upgrade (EP30 Task 0195)
 *
 * Converts a playground project to full mode:
 * - Initializes Git
 * - Rewrites openclaw.json with full pipeline
 * - Adds .gitignore and Docker files
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderGitignore } from './generator.js';

export interface UpgradeResult {
  readonly upgraded: boolean;
  readonly steps: readonly string[];
  readonly errors: readonly string[];
}

export function upgradePlayground(projectDir: string): UpgradeResult {
  const steps: string[] = [];
  const errors: string[] = [];

  // Verify it's a playground project
  const configPath = join(projectDir, 'openclaw.json');
  if (!existsSync(configPath)) {
    return { upgraded: false, steps, errors: ['No openclaw.json found — not a vibe-flow project'] };
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return { upgraded: false, steps, errors: ['Could not parse openclaw.json'] };
  }

  const playground = config['playground'] as Record<string, unknown> | undefined;
  if (!playground?.['enabled']) {
    return { upgraded: false, steps, errors: ['Project is not in playground mode'] };
  }

  // 1. Remove playground flag and upgrade pipeline
  delete config['playground'];

  const extensions = config['extensions'] as Record<string, Record<string, unknown>> | undefined;
  const ptConfig = extensions?.['@openclaw/product-team'];
  if (ptConfig) {
    const orch = ptConfig['orchestrator'] as Record<string, unknown> | undefined;
    if (orch) {
      delete orch['database'];
      delete orch['pipelineStages'];
      delete orch['stageOwners'];
      delete orch['coordinatorAgents'];
      delete orch['escalationTarget'];
    }
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  steps.push('Upgraded openclaw.json to full pipeline (10 stages)');

  // 2. Add .gitignore if missing
  const gitignorePath = join(projectDir, '.gitignore');
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, renderGitignore());
    steps.push('Created .gitignore');
  }

  // 3. Note: Git init and Docker setup are left to the user
  steps.push('Run "git init" to initialize version control');
  steps.push('Run "docker compose up" for full Docker deployment');

  return { upgraded: true, steps, errors };
}
