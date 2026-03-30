#!/usr/bin/env node
/**
 * create-vibe-flow CLI (EP30 Task 0191)
 *
 * Usage: npx create-vibe-flow [project-name] [options]
 */

import { resolve } from 'node:path';
import type { CLIFlags, TeamSize, ModelTier, ProjectType } from './types.js';
import { detectProviders } from './detect-providers.js';
import { validateProjectName, generateProject } from './generator.js';
import { generatePlayground } from './playground.js';
import { upgradePlayground } from './upgrade.js';
import { runSmokeTest } from './smoke-test.js';
import { autoDetectModelTier } from './templates/model-presets.js';
import { runWizard } from './wizard.js';
import { buildConfig } from './config-builder.js';
import * as log from './logger.js';

const HELP_TEXT = `
  Usage: npx create-vibe-flow [project-name] [options]
         npx create-vibe-flow upgrade [dir]

  Options:
    --team minimal|full       Team size (default: minimal)
    --model free|mixed|premium  Model tier (default: auto-detect)
    --type webapp|api|cli|lib   Project type (default: webapp)
    --playground                Playground mode (no Git, no Docker)
    --defaults                  Skip wizard, use defaults
    --force                     Overwrite existing directory
    --help                      Show help

  Commands:
    upgrade [dir]               Upgrade playground project to full mode

  Examples:
    npx create-vibe-flow my-app
    npx create-vibe-flow my-api --team full --model premium
    npx create-vibe-flow sandbox --playground --defaults
    npx create-vibe-flow upgrade ./sandbox
`;

const VALID_TEAMS = new Set<string>(['minimal', 'full']);
const VALID_MODELS = new Set<string>(['free', 'mixed', 'premium']);
const VALID_TYPES = new Set<string>(['webapp', 'api', 'cli', 'lib']);

export function parseArgs(argv: string[]): CLIFlags {
  let projectName: string | undefined;
  let team: TeamSize | undefined;
  let model: ModelTier | undefined;
  let type: ProjectType | undefined;
  let playground = false;
  let defaults = false;
  let force = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--playground') {
      playground = true;
    } else if (arg === '--defaults') {
      defaults = true;
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--team' && i + 1 < argv.length) {
      const val = argv[++i]!;
      if (VALID_TEAMS.has(val)) team = val as TeamSize;
    } else if (arg === '--model' && i + 1 < argv.length) {
      const val = argv[++i]!;
      if (VALID_MODELS.has(val)) model = val as ModelTier;
    } else if (arg === '--type' && i + 1 < argv.length) {
      const val = argv[++i]!;
      if (VALID_TYPES.has(val)) type = val as ProjectType;
    } else if (!arg.startsWith('-') && !projectName) {
      projectName = arg;
    }
  }

  return { projectName, team, model, type, playground, defaults, force, help };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  // Handle upgrade subcommand
  if (argv[0] === 'upgrade') {
    const upgradeDir = resolve(process.cwd(), argv[1] ?? '.');
    log.banner();
    log.step('Upgrading playground to full mode...');
    const result = upgradePlayground(upgradeDir);
    if (!result.upgraded) {
      for (const err of result.errors) log.error(err);
      process.exitCode = 1;
      return;
    }
    for (const step of result.steps) log.info(step);
    log.success('Upgrade complete');
    return;
  }

  const flags = parseArgs(argv);

  if (flags.help) {
    console.log(HELP_TEXT);
    return;
  }

  log.banner();

  // Detect providers
  log.step('Detecting environment...');
  const providers = detectProviders();

  // Interactive wizard or defaults
  const isInteractive = process.stdin.isTTY === true && !flags.defaults;

  let options;
  if (isInteractive && !flags.model && !flags.team && !flags.type) {
    const answers = await runWizard(flags.projectName);
    const nameError = validateProjectName(answers.projectName);
    if (nameError) {
      log.error(`Invalid project name "${answers.projectName}": ${nameError}`);
      process.exitCode = 1;
      return;
    }
    options = buildConfig(answers, providers, { playground: flags.playground, force: flags.force });
  } else {
    const projectName = flags.projectName ?? 'my-vibe-project';
    const nameError = validateProjectName(projectName);
    if (nameError) {
      log.error(`Invalid project name "${projectName}": ${nameError}`);
      process.exitCode = 1;
      return;
    }
    const modelTier = flags.model ?? autoDetectModelTier(providers);
    options = {
      projectName,
      projectDir: resolve(process.cwd(), projectName),
      team: flags.team ?? 'minimal',
      model: modelTier,
      type: flags.type ?? 'webapp',
      playground: flags.playground,
      force: flags.force,
    };
  }

  if (options.model === 'free') {
    log.info('Running in free-tier mode (GitHub Copilot only).');
    log.info('For better results, set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
  } else {
    log.info(`Model tier: ${options.model}`);
  }

  // Generate project
  const generator = options.playground ? generatePlayground : generateProject;
  log.step(
    options.playground ? 'Generating playground project...' : 'Generating project...',
    options.projectDir,
  );
  try {
    generator(options, providers);
  } catch (err: unknown) {
    log.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  // Smoke test
  log.step('Validating configuration...');
  const smokeResult = runSmokeTest(options.projectDir);
  if (!smokeResult.passed) {
    for (const err of smokeResult.errors) {
      log.warn(err);
    }
    log.error('Smoke test failed. The project may have issues.');
    process.exitCode = 1;
    return;
  }
  log.success('All configuration files valid');

  // Done
  log.done(options.projectName, options.projectDir);
  if (options.playground) {
    log.info('Playground mode: no Git, no Docker, in-memory pipeline.');
    log.info('Agent outputs will be saved to ./output/');
    log.info('Run "npx create-vibe-flow upgrade" when ready for full mode.');
  }
}

main().catch((err: unknown) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
