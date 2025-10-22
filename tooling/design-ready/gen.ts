import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ValidateFunction } from 'ajv';

import { generateTypes } from './generate-types.js';
import { createValidator } from './schema.js';
import { loadAdrIds, loadDesignReadySources, loadPatternIds } from './loaders.js';
import type { DesignReadyDocument } from './types.js';
import { validateDesignReadyDocument } from './validators.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getRepoRoot(): string {
  return path.resolve(process.cwd());
}

async function main(): Promise<void> {
  await generateTypes();

  const validator = await createValidator();
  const patternIds = await loadPatternIds();
  const adrIds = await loadAdrIds();
  const sources = await loadDesignReadySources(patternIds);

  if (sources.length === 0) {
    console.warn('[design-ready] No spec files found under docs/epics/**/10-spec.md');
    return;
  }

  let hadError = false;

  for (const source of sources) {
    const issues = await processSource(source.document, source.sourcePath, {
      validator,
      patternIds,
      adrIds,
    });

    hadError ||= issues;
  }

  if (hadError) {
    process.exitCode = 1;
  }
}

interface ProcessContext {
  validator: ValidateFunction;
  patternIds: Set<string>;
  adrIds: Set<string>;
}

async function processSource(
  document: DesignReadyDocument,
  sourcePath: string,
  ctx: ProcessContext,
): Promise<boolean> {
  const outputPath = resolveOutputPath(sourcePath);
  const repoRoot = getRepoRoot();
  const relOutPath = path.relative(repoRoot, outputPath);
  const relSourcePath = path.relative(repoRoot, sourcePath);

  if (!ctx.validator(document)) {
    console.error(`[design-ready] Schema validation failed for ${relSourcePath}`);
    if (ctx.validator.errors) {
      for (const error of ctx.validator.errors) {
        console.error(`  • ${error.instancePath || '/'} ${error.message ?? ''}`.trim());
      }
    }
    return true;
  }

  const domainIssues = validateDesignReadyDocument(document, {
    patternIds: ctx.patternIds,
    adrIds: ctx.adrIds,
    sourcePath,
  });

  if (domainIssues.length > 0) {
    console.error(`[design-ready] Domain validation failed for ${relSourcePath}`);
    for (const issue of domainIssues) {
      console.error(`  • ${issue.path}: ${issue.message}`);
      if (issue.hint) {
        console.error(`    hint: ${issue.hint}`);
      }
    }
    return true;
  }

  const sorted = sortDocument(document);
  await fs.writeFile(outputPath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
  console.log(`[design-ready] Wrote ${relOutPath}`);
  return false;
}

function resolveOutputPath(specPath: string): string {
  const dir = path.dirname(specPath);
  return path.join(dir, '20-design_ready.json');
}

function sortDocument(document: DesignReadyDocument): DesignReadyDocument {
  const sortedModules = [...document.modules].sort((a, b) => a.key.localeCompare(b.key));
  const sortedContracts = [...document.contracts].sort((a, b) => a.id.localeCompare(b.id));
  const sortedPatterns = [...document.patterns].sort((a, b) => a.id.localeCompare(b.id));
  const sortedAcceptance = [...document.test_plan.acceptance].sort((a, b) => a.id.localeCompare(b.id));

  return {
    ...document,
    modules: sortedModules,
    contracts: sortedContracts,
    patterns: sortedPatterns,
    test_plan: {
      ...document.test_plan,
      acceptance: sortedAcceptance,
    },
  };
}

if (process.argv[1] === __filename) {
  await main().catch((error) => {
    console.error('[design-ready] Failed to generate design ready artifacts.');
    console.error(error);
    process.exitCode = 1;
  });
}
