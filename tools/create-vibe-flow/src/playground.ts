/**
 * Playground Generator (EP30 Task 0195)
 *
 * Generates a playground project: no Git, no Docker, in-memory pipeline,
 * agent outputs to ./output/. Perfect for casual evaluation.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GenerateOptions, DetectedProviders } from './types.js';
import { renderPackageJson } from './templates/package-json.js';
import { renderPlaygroundConfig } from './templates/playground-config.js';
import { renderStartSh, renderStartPs1 } from './templates/start-script.js';
import { renderEnvFile } from './generator.js';

export function generatePlayground(options: GenerateOptions, providers: DetectedProviders): void {
  const { projectDir, force } = options;

  if (existsSync(projectDir) && !force) {
    throw new Error(`Directory "${projectDir}" already exists. Use --force to overwrite.`);
  }

  // Create directory structure
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(join(projectDir, 'scripts'), { recursive: true });
  mkdirSync(join(projectDir, 'output'), { recursive: true });

  // Write files (no .gitignore — no Git in playground)
  writeFileSync(join(projectDir, 'package.json'), renderPackageJson(options));
  writeFileSync(join(projectDir, 'openclaw.json'), renderPlaygroundConfig(options));
  writeFileSync(join(projectDir, '.env'), renderEnvFile(providers));
  writeFileSync(join(projectDir, 'README.md'), renderPlaygroundReadme(options));
  writeFileSync(join(projectDir, 'scripts', 'start.sh'), renderStartSh(options.projectName), { mode: 0o755 });
  writeFileSync(join(projectDir, 'scripts', 'start.ps1'), renderStartPs1(options.projectName));
}

function renderPlaygroundReadme(options: GenerateOptions): string {
  return `# ${options.projectName} (Playground)

> **Playground mode** — no Git, no Docker, in-memory pipeline state.
> Agent outputs are saved to \`./output/\`.
> Pipeline state is lost on restart — that's OK for experimentation.

## Quick Start

\`\`\`bash
cd ${options.projectName}
npm install
npm start
\`\`\`

## Limitations

- **No version control** — files are not tracked by Git
- **No Docker** — runs directly on the host
- **In-memory state** — pipeline progress resets on restart
- **4-stage pipeline** — IDEA → IMPLEMENTATION → QA → DONE

## Upgrade to Full Mode

When you're ready for production use:

\`\`\`bash
npx create-vibe-flow upgrade
\`\`\`

This will:
1. Initialize a Git repository
2. Add full pipeline configuration (10 stages)
3. Add Docker and CI/CD setup
4. Preserve your existing code and configuration

See [Free-Tier Mode Guide](https://openclaw.ai/docs/guides/free-tier-mode) for details.
`;
}
