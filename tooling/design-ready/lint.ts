import { promises as fs, Dirent } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ValidateFunction } from 'ajv';

import { createValidator } from './schema.js';
import { loadAdrIds, loadPatternIds } from './loaders.js';
import type { DesignReadyDocument } from './types.js';
import { validateDesignReadyDocument, type DomainIssue } from './validators.js';

interface LintIssue extends DomainIssue {
  file: string;
}

interface LintSummary {
  issues: LintIssue[];
  checked: number;
  targetFiles: string[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getRepoRoot(): string {
  return path.resolve(process.cwd());
}

async function main(): Promise<void> {
  const summary = await lintRepository();
  reportSummary(summary);
  if (summary.issues.length > 0) {
    process.exitCode = 1;
  }
}

export async function lintRepository(): Promise<LintSummary> {
  const patternIds = await loadPatternIds();
  const adrIds = await loadAdrIds();
  const validator = await createValidator();
  const documents = await discoverDesignReadyDocuments();
  const repoRoot = getRepoRoot();
  const issues: LintIssue[] = [];

  for (const filePath of documents) {
    const docIssues = await lintDocument(filePath, validator, patternIds, adrIds, repoRoot);
    issues.push(...docIssues);
  }

  return {
    issues,
    checked: documents.length,
    targetFiles: documents.map((file) => path.relative(repoRoot, file)),
  };
}

async function lintDocument(
  filePath: string,
  validator: ValidateFunction,
  patternIds: Set<string>,
  adrIds: Set<string>,
  repoRoot: string,
): Promise<LintIssue[]> {
  const relative = path.relative(repoRoot, filePath);
  const raw = await fs.readFile(filePath, 'utf8');
  let parsed: DesignReadyDocument;

  try {
    parsed = JSON.parse(raw) as DesignReadyDocument;
  } catch (error) {
    return [
      {
        file: relative,
        path: '/',
        message: `Invalid JSON: ${(error as Error).message}`,
      },
    ];
  }

  const issues: LintIssue[] = [];

  if (!validator(parsed)) {
    const errors = validator.errors ?? [];
    for (const error of errors) {
      issues.push({
        file: relative,
        path: error.instancePath || '/',
        message: error.message ?? 'Schema validation error',
      });
    }
  }

  const domainIssues = validateDesignReadyDocument(parsed, { patternIds, adrIds, sourcePath: filePath });
  for (const issue of domainIssues) {
    issues.push({
      ...issue,
      file: relative,
    });
  }

  return issues;
}

async function discoverDesignReadyDocuments(): Promise<string[]> {
  const baseDir = path.join(getRepoRoot(), 'docs', 'epics');
  const present = await pathExists(baseDir);
  if (!present) {
    return [];
  }

  const matches: string[] = [];

  await walk(baseDir, async (entry, currentDir) => {
    if (entry.isFile() && entry.name === '20-design_ready.json') {
      matches.push(path.join(currentDir, entry.name));
    }
  });

  return matches.sort((a, b) => a.localeCompare(b));
}

async function walk(dir: string, onEntry: (entry: Dirent, dir: string) => Promise<void>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    await onEntry(entry, dir);
    if (entry.isDirectory()) {
      await walk(target, onEntry);
    }
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function reportSummary(summary: LintSummary): void {
  if (summary.issues.length === 0) {
    console.log(`[design-ready] ${summary.checked} document(s) validated successfully.`);
    return;
  }

  console.error('[design-ready] Issues detected:');
  for (const issue of summary.issues) {
    const hint = issue.hint ? `\n    hint: ${issue.hint}` : '';
    console.error(`  • ${issue.file} :: ${issue.path} :: ${issue.message}${hint}`);
  }
  console.error(`[design-ready] ${summary.issues.length} issue(s) found across ${summary.checked} document(s).`);
}

if (process.argv[1] === __filename) {
  await main().catch((error) => {
    console.error('[design-ready] Lint run failed');
    console.error(error);
    process.exitCode = 1;
  });
}
