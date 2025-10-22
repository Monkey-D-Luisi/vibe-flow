import { Dirent, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontMatter } from '../design-ready/front-matter.js';

const __filename = fileURLToPath(import.meta.url);

interface TaskIssue {
  file: string;
  message: string;
}

interface LintSummary {
  issues: TaskIssue[];
  checked: number;
}

async function main(): Promise<void> {
  const summary = await lintTasks();
  if (summary.issues.length > 0) {
    console.error('[tasks:lint] Issues detected:');
    for (const issue of summary.issues) {
      console.error(`  - ${issue.file}: ${issue.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`[tasks:lint] ${summary.checked} task spec(s) validated.`);
  }
}

async function lintTasks(): Promise<LintSummary> {
  const repoRoot = path.resolve(process.cwd());
  const specs = await findSpecFiles(path.join(repoRoot, 'docs', 'epics'));
  const issues: TaskIssue[] = [];

  for (const specFile of specs) {
    const raw = await fs.readFile(specFile, 'utf8');
    const { attributes } = parseFrontMatter<{ design_ready?: unknown }>(raw);
    if (!attributes.design_ready) {
      issues.push({
        file: path.relative(repoRoot, specFile),
        message: 'Front matter must include a design_ready block.',
      });
    }
  }

  return {
    issues,
    checked: specs.length,
  };
}

async function findSpecFiles(root: string): Promise<string[]> {
  if (!(await pathExists(root))) {
    return [];
  }

  const matches: string[] = [];
  await walk(root, async (entry, parent) => {
    if (entry.isFile() && entry.name === '10-spec.md') {
      matches.push(path.join(parent, entry.name));
    }
  });

  return matches;
}

async function walk(dir: string, onEntry: (entry: Dirent, parent: string) => Promise<void>): Promise<void> {
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

if (process.argv[1] === __filename) {
  await main();
}

export { lintTasks };
